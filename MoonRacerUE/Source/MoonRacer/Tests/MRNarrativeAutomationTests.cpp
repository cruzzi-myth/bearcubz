// Moon Racer - P5A narrative systems automation tests. Run:
//   UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer.Narrative; Quit" -unattended -nullrhi -nosplash -nosound
// ALL content is TEST FIXTURE - NONCANON. Dedicated save slots only; default player saves are never touched.
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Dev/MRNarrativeFixtures.h"
#include "Engine/GameInstance.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Narrative/MRNarrativeServices.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "Onboarding/MROnboardingSubsystem.h"
#include "UObject/StrongObjectPtr.h"

namespace
{
	constexpr EAutomationTestFlags TestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;
	const TCHAR* NarrSlot = TEXT("MRNarrative_AutomationTest");
	using namespace MRNarrativeFixtures;

	struct FNarr
	{
		TStrongObjectPtr<UGameInstance> GI;
		TStrongObjectPtr<UMRNarrativeSubsystem> N;
		FMRNarrativeBundle Bundle;
		FMRValidationReport Report;
		bool bRegistered = false;

		explicit FNarr(bool bRegister = true, bool bFreshSlot = true)
		{
			FMRNarrativeStore::SetSlotBaseOverride(NarrSlot);
			if (bFreshSlot) FMRNarrativeStore::Delete();
			RegisterStrings();
			GI.Reset(NewObject<UGameInstance>(GetTransientPackage()));
			N.Reset(NewObject<UMRNarrativeSubsystem>(GI.Get()));
			N->Setup();
			Bundle = Build(GI.Get());
			if (bRegister) bRegistered = N->RegisterBundle(Bundle, FMRValidationPolicy(), Report);
		}
		UMRDialogueRuntime* R() const { return N->GetRuntime(); }
		UMRDialogueGraph* Alpha() const { return Bundle.Graphs[0]; }
		static FMRDialogueNode* FindMut(UMRDialogueGraph* G, const TCHAR* Id) { for (FMRDialogueNode& X : G->Nodes) if (X.NodeId == FName(Id)) return &X; return nullptr; }
	};

	// Run the alpha conversation along a path. Returns the final result.
	FMRDialogueResult RunAlpha(FNarr& F, const TArray<const TCHAR*>& ChoicePath)
	{
		FMRDialogueResult Out; bool bDone = false;
		F.R()->Start(GraphAlpha(), [&](const FMRDialogueResult& R) { Out = R; bDone = true; });
		int32 Guard = 0, ChoiceIdx = 0;
		while (!bDone && Guard++ < 20)
		{
			const FMRDialogueView& V = F.R()->GetView();
			if (V.bCanContinue) F.R()->Continue();
			else if (V.Choices.Num()) { F.R()->Choose(FName(ChoicePath.IsValidIndex(ChoiceIdx) ? ChoicePath[ChoiceIdx] : TEXT("c_no"))); ++ChoiceIdx; }
			else break;
		}
		return Out;
	}

	struct FOnb
	{
		TStrongObjectPtr<UGameInstance> GI; TStrongObjectPtr<UMROnboardingSubsystem> S;
		FOnb(const TCHAR* Base)
		{
			FMRProgressStore::SetSlotBaseOverride(Base); FMRProgressStore::DeleteBoth();
			GI.Reset(NewObject<UGameInstance>(GetTransientPackage()));
			S.Reset(NewObject<UMROnboardingSubsystem>(GI.Get()));
			S->UseDevServices(nullptr); S->bLoadContentFromAsset = false;
			FMRAvatarRef Ref; Ref.AvatarId = FGuid::NewGuid(); Ref.Revision = 1;
			Cast<UMRDevAvatarFlowService>(S->AvatarService)->ForcedRef = Ref;
		}
		UMRDevInteractionService* Interact() const { return Cast<UMRDevInteractionService>(S->InteractionService); }
		UMRDevSpawnService* Spawn() const { return Cast<UMRDevSpawnService>(S->SpawnService); }
	};
}

// ---------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Schema, "MoonRacer.Narrative.Schema.FixtureBundleIsValid", TestFlags)
bool FMRNarr_Schema::RunTest(const FString&)
{
	FNarr F;
	TestTrue(TEXT("fixture bundle registers"), F.bRegistered);
	TestEqual(TEXT("no diagnostics errors"), F.Report.NumErrors(), 0);
	TestTrue(TEXT("NPC lookup by stable id"), F.N->FindNpc(NpcAlpha()) != nullptr && F.N->FindNpc(NpcBeta()) != nullptr);
	TestTrue(TEXT("graph, mission lookup"), F.N->FindGraph(GraphAlpha()) && F.N->FindMission(Mission()) && F.N->FindMissionOfObjective(Obj2()) == F.N->FindMission(Mission()));
	TestTrue(TEXT("records are flagged fixtures with the prefix"), F.N->FindNpc(NpcAlpha())->bTestFixture && MRNarrative::HasFixturePrefix(GraphAlpha()));
	TestTrue(TEXT("versions come from the records"), F.N->GetContentVersions().DialogueVersion == Version() && F.N->GetContentVersions().QuestRegistryVersion == Version());
	TestTrue(TEXT("core manifest stays unresolved (blocked content)"), F.N->GetContentVersions().CoreManifestVersion == FName("unresolved"));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Invalid, "MoonRacer.Narrative.Validation.RejectsInvalidContent", TestFlags)
bool FMRNarr_Invalid::RunTest(const FString&)
{
	struct FMut { const TCHAR* Code; TFunction<void(FMRNarrativeBundle&, FNarr&)> Apply; };
	const TArray<FMut> Muts = {
		{ TEXT("DUPLICATE_ID"),         [](FMRNarrativeBundle& B, FNarr&) { TObjectPtr<UMRDialogueGraph> Dup = B.Graphs[1]; B.Graphs.Add(Dup); } },
		{ TEXT("DUPLICATE_ID"),         [](FMRNarrativeBundle& B, FNarr&) { const FMRDialogueNode Dup = B.Graphs[0]->Nodes[0]; B.Graphs[0]->Nodes.Add(Dup); } },
		{ TEXT("EMPTY_ID"),             [](FMRNarrativeBundle& B, FNarr&) { B.Graphs[1]->RecordId = NAME_None; } },
		{ TEXT("NULL_RECORD"),          [](FMRNarrativeBundle& B, FNarr&) { B.Npcs.Add(nullptr); } },
		{ TEXT("DANGLING_EDGE"),        [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_start"))->NextNodeId = FName("n_missing"); } },
		{ TEXT("DANGLING_EDGE"),        [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_ask"))->Choices[0].NextNodeId = FName("n_missing"); } },
		{ TEXT("BAD_START"),            [](FMRNarrativeBundle& B, FNarr&) { B.Graphs[0]->StartNodeId = FName("zz"); } },
		{ TEXT("UNKNOWN_NPC"),          [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_start"))->SpeakerNpcId = FName("NOPE"); } },
		{ TEXT("UNKNOWN_NPC"),          [](FMRNarrativeBundle& B, FNarr&) { B.Missions[0]->OfferingNpcId = FName("NOPE"); } },
		{ TEXT("UNKNOWN_GRAPH"),        [](FMRNarrativeBundle& B, FNarr&) { B.Npcs[0]->DefaultDialogueGraphId = FName("NOPE"); } },
		{ TEXT("UNREACHABLE_NODE"),     [](FMRNarrativeBundle& B, FNarr&) { FMRDialogueNode O; O.NodeId = FName("n_orphan"); O.Type = EMRDialogueNodeType::Line; O.TextKey = FName("alpha_1"); O.NextNodeId = FName("n_end_no"); B.Graphs[0]->Nodes.Add(O); } },
		{ TEXT("NON_TERMINATING"),      [](FMRNarrativeBundle& B, FNarr&) { FMRDialogueNode* E = FNarr::FindMut(B.Graphs[0], TEXT("n_end_back")); E->Type = EMRDialogueNodeType::Line; E->TextKey = FName("alpha_1"); E->NextNodeId = FName("n_back"); } },
		{ TEXT("NO_END_NODE"),          [](FMRNarrativeBundle& B, FNarr&) { FMRDialogueNode* E = FNarr::FindMut(B.Graphs[1], TEXT("n_b_end")); E->Type = EMRDialogueNodeType::Line; E->TextKey = FName("beta_1"); E->NextNodeId = FName("n_b1"); } },
		{ TEXT("BRANCH_CYCLE"),         [](FMRNarrativeBundle& B, FNarr&) {
			FMRDialogueNode X, Y; X.NodeId = FName("n_x"); Y.NodeId = FName("n_y"); X.Type = Y.Type = EMRDialogueNodeType::Branch;
			FMRDialogueChoice CX; CX.ChoiceId = FName("cx"); CX.NextNodeId = FName("n_y"); FMRDialogueChoice CY; CY.ChoiceId = FName("cy"); CY.NextNodeId = FName("n_x"); X.Choices = { CX }; Y.Choices = { CY };
			B.Graphs[0]->Nodes.Add(X); B.Graphs[0]->Nodes.Add(Y);
			FMRDialogueChoice In; In.ChoiceId = FName("b_in"); In.NextNodeId = FName("n_x"); FMRDialogueCondition C; C.Type = EMRConditionType::DialogueCompleted; C.Subject = GraphBeta(); In.Conditions.Add(C);
			FNarr::FindMut(B.Graphs[0], TEXT("n_gate"))->Choices.Insert(In, 0); } },
		{ TEXT("NO_CHOICES"),           [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_ask"))->Choices.Empty(); } },
		{ TEXT("NO_FALLBACK_CHOICE"),   [](FMRNarrativeBundle& B, FNarr&) { FMRDialogueCondition C; C.Type = EMRConditionType::FactSet; C.Subject = FactSecret(); for (FMRDialogueChoice& Ch : FNarr::FindMut(B.Graphs[0], TEXT("n_ask"))->Choices) Ch.Conditions.Add(C); } },
		{ TEXT("UNKNOWN_MISSION"),      [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_ask"))->Choices[0].Effects[0].Subject = FName("NOPE"); } },
		{ TEXT("UNKNOWN_OBJECTIVE"),    [](FMRNarrativeBundle& B, FNarr&) { FMRDialogueCondition C; C.Type = EMRConditionType::ObjectiveCompleted; C.Subject = FName("NOPE"); FNarr::FindMut(B.Graphs[0], TEXT("n_ask"))->Choices[1].Conditions.Add(C); } },
		{ TEXT("BAD_CONDITION"),        [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_ask"))->Choices[1].Conditions[0].Subject = NAME_None; } },
		{ TEXT("BAD_EFFECT"),           [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_start"))->OnEnterEffects[0].Subject = NAME_None; } },
		{ TEXT("MISSING_EFFECT_ID"),    [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_start"))->OnEnterEffects[0].EffectId = NAME_None; } },
		{ TEXT("DUPLICATE_EFFECT_ID"),  [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_start"))->OnEnterEffects[0].EffectId = FxOffer(); } },
		{ TEXT("STRINGTABLE_MISSING"),  [](FMRNarrativeBundle& B, FNarr&) { B.Graphs[1]->StringTableId = NAME_None; } },
		{ TEXT("MISSING_STRING_KEY"),   [](FMRNarrativeBundle& B, FNarr&) { B.Graphs[1]->StringTableId = FName("NO_SUCH_TABLE"); } },
		{ TEXT("MISSING_STRING_KEY"),   [](FMRNarrativeBundle& B, FNarr&) { FNarr::FindMut(B.Graphs[0], TEXT("n_start"))->TextKey = FName("no_such_key"); } },
		{ TEXT("MISSING_STRING_KEY"),   [](FMRNarrativeBundle& B, FNarr&) { B.Missions[0]->Objectives[0].TextKey = FName("no_such_key"); } },
		{ TEXT("MISSING_VERSION"),      [](FMRNarrativeBundle& B, FNarr&) { B.Graphs[1]->ContentVersion = NAME_None; } },
		{ TEXT("VERSION_MISMATCH"),     [](FMRNarrativeBundle& B, FNarr&) { B.Npcs[0]->ContentVersion = FName("OTHER_VERSION"); } },
		{ TEXT("VERSION_MISMATCH"),     [](FMRNarrativeBundle& B, FNarr& F) { UMRMissionRecord* M2 = NewObject<UMRMissionRecord>(F.GI.Get()); M2->RecordId = FName("TEST_FIXTURE_MISSION_2"); M2->bTestFixture = true; M2->ContentVersion = FName("OTHER_VERSION"); M2->StringTableId = TableId(); M2->TitleKey = FName("mission_title"); FMRObjectiveDef O; O.ObjectiveId = FName("TEST_FIXTURE_OBJ_9"); O.TextKey = FName("obj_1"); O.CompletionEventId = FName("E"); M2->Objectives = { O }; M2->Provenance.SourceDocumentId = FName("X"); B.Missions.Add(M2); } },
		{ TEXT("MISSING_PROVENANCE"),   [](FMRNarrativeBundle& B, FNarr&) { B.Npcs[1]->bTestFixture = false; B.Npcs[1]->RecordId = FName("REAL_NPC_NO_PROVENANCE"); } },
		{ TEXT("FIXTURE_ID_MISMATCH"),  [](FMRNarrativeBundle& B, FNarr&) { B.Npcs[1]->bTestFixture = false; B.Npcs[1]->Provenance.SourceDocumentId = FName("S"); B.Npcs[1]->Provenance.ApprovalId = FName("A"); } },
		{ TEXT("FIXTURE_ID_MISMATCH"),  [](FMRNarrativeBundle& B, FNarr&) { B.Npcs[1]->RecordId = FName("NOT_PREFIXED"); } },
		{ TEXT("FIXTURE_LEAK"),         [](FMRNarrativeBundle& B, FNarr& F) { UMRNpcRecord* R = NewObject<UMRNpcRecord>(F.GI.Get()); R->RecordId = FName("REAL_NPC"); R->ContentVersion = Version(); R->Provenance.SourceDocumentId = FName("S"); R->Provenance.ApprovalId = FName("A"); R->StringTableId = TableId(); R->DisplayNameKey = FName("npc_alpha_name"); R->DefaultDialogueGraphId = GraphBeta(); B.Npcs.Add(R); } },
		{ TEXT("NO_OBJECTIVES"),        [](FMRNarrativeBundle& B, FNarr&) { B.Missions[0]->Objectives.Empty(); } },
		{ TEXT("BAD_OBJECTIVE"),        [](FMRNarrativeBundle& B, FNarr&) { B.Missions[0]->Objectives[0].CompletionEventId = NAME_None; } },
		{ TEXT("DUPLICATE_ID"),         [](FMRNarrativeBundle& B, FNarr&) { B.Missions[0]->Objectives[1].ObjectiveId = B.Missions[0]->Objectives[0].ObjectiveId; } },
	};
	int32 Idx = 0;
	for (const FMut& M : Muts)
	{
		FNarr F(/*register*/ false);
		M.Apply(F.Bundle, F);
		FMRValidationReport R; MRNarrative::ValidateBundle(F.Bundle, FMRValidationPolicy(), R);
		const FString Label = FString::Printf(TEXT("mutation %d expects %s"), Idx++, M.Code);
		TestTrue(Label, R.HasCode(M.Code));
		bool bActionable = true; for (const FMRDiagnostic& D : R.Items) if (D.bError && (D.Message.Len() < 10 || D.RecordId.IsNone())) bActionable = false;
		TestTrue(Label + TEXT(" diagnostics are actionable (record id + message)"), bActionable);
		FMRValidationReport R2; TestFalse(Label + TEXT(" is rejected by the registry"), F.N->RegisterBundle(F.Bundle, FMRValidationPolicy(), R2));
		TestFalse(Label + TEXT(" leaves the registry empty"), F.N->HasBundle());
	}
	// missing key via the string table itself
	{
		RegisterStrings(FName("alpha_ask"));
		FNarr F(false, true); RegisterStrings(FName("alpha_ask"));
		FMRValidationReport R; MRNarrative::ValidateBundle(F.Bundle, FMRValidationPolicy(), R);
		TestTrue(TEXT("a key missing from the string table is reported"), R.HasCode(TEXT("MISSING_STRING_KEY")));
		RegisterStrings();
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Isolation, "MoonRacer.Narrative.Isolation.FixturesAndSlots", TestFlags)
bool FMRNarr_Isolation::RunTest(const FString&)
{
	FNarr F(false);
	FMRValidationPolicy Prod; Prod.bAllowTestFixtures = false;
	FMRValidationReport R; TestFalse(TEXT("production policy rejects the fixture bundle"), F.N->RegisterBundle(F.Bundle, Prod, R));
	TestTrue(TEXT("with FIXTURE_NOT_ALLOWED"), R.HasCode(TEXT("FIXTURE_NOT_ALLOWED")));
	TestFalse(TEXT("registry stays empty"), F.N->HasBundle());
	FMRValidationReport R2; TestTrue(TEXT("dev policy accepts it"), F.N->RegisterBundle(F.Bundle, FMRValidationPolicy(), R2));
	// a bad bundle must not replace a good registry
	FNarr G(false); G.Alpha()->StartNodeId = FName("zz"); FMRValidationReport R3;
	TestFalse(TEXT("bad bundle rejected"), F.N->RegisterBundle(G.Bundle, FMRValidationPolicy(), R3));
	TestTrue(TEXT("previous registry still intact"), F.N->HasBundle() && F.N->FindGraph(GraphAlpha()) != nullptr);
	// slot isolation
	TestTrue(TEXT("tests run on a dedicated narrative slot"), FMRNarrativeStore::SlotBase() == NarrSlot && !FMRNarrativeStore::IsDefaultSlot());
	for (const TCHAR* Name : { TEXT("MRNarrative_Local.sav"), TEXT("MRProgress_Local_A.sav"), TEXT("MRProgress_Local_B.sav"), TEXT("MRAvatar_Local.sav") })
		TestFalse(FString::Printf(TEXT("default slot %s untouched"), Name), IFileManager::Get().FileExists(*(FPaths::ProjectSavedDir() / TEXT("SaveGames") / Name)));
	for (const FString& Id : { GraphAlpha().ToString(), NpcAlpha().ToString(), Mission().ToString() })
		TestTrue(TEXT("fixture id prefix: ") + Id, Id.StartsWith(TEXT("TEST_FIXTURE_")));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Strings, "MoonRacer.Narrative.Localization.StringTablesOnly", TestFlags)
bool FMRNarr_Strings::RunTest(const FString&)
{
	FNarr F;
	const FText T = MRNarrative::ResolveText(TableId(), FName("alpha_1"));
	TestTrue(TEXT("text resolves from the string table"), T.IsFromStringTable() && T.ToString().StartsWith(TEXT("TEST FIXTURE - NONCANON")));
	AddExpectedError(TEXT("MRNARR|MISSING_TEXT"), EAutomationExpectedErrorFlags::Contains, 0);
	const FText Missing = MRNarrative::ResolveText(TableId(), FName("no_such_key"));
	TestTrue(TEXT("a missing key yields a visible marker, never empty text"), Missing.ToString().Contains(TEXT("MISSING TEXT")));
	TestTrue(TEXT("UI chrome strings come from their own table"), MRNarrative::UiText(TEXT("continue")).ToString() == TEXT("Continue") && MRNarrative::UiText(TEXT("continue")).IsFromStringTable());
	// every fixture string is labelled noncanon
	bool bAllLabelled = true;
	for (const TCHAR* K : { TEXT("alpha_1"), TEXT("alpha_ask"), TEXT("resp_yes"), TEXT("beta_1"), TEXT("mission_title"), TEXT("obj_1"), TEXT("npc_alpha_name") })
		bAllLabelled &= MRNarrative::ResolveText(TableId(), FName(K)).ToString().StartsWith(TEXT("TEST FIXTURE - NONCANON"));
	TestTrue(TEXT("all fixture strings are labelled TEST FIXTURE - NONCANON"), bAllLabelled);
	// runtime view text is FText from the table
	F.R()->Start(GraphAlpha());
	TestTrue(TEXT("dialogue view text comes from the table"), F.R()->GetView().Text.IsFromStringTable() && F.R()->GetView().Speaker.ToString().Contains(TEXT("Alpha")));
	F.R()->Cancel();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Traversal, "MoonRacer.Narrative.Dialogue.TraversalBranchingChoices", TestFlags)
bool FMRNarr_Traversal::RunTest(const FString&)
{
	FNarr F;
	// first run, decline path
	FMRDialogueResult Done; bool bFinished = false;
	TestTrue(TEXT("start"), F.R()->Start(GraphAlpha(), [&](const FMRDialogueResult& R) { Done = R; bFinished = true; }));
	TestTrue(TEXT("opens on the start node as a Line"), F.R()->GetView().NodeId == FName("n_start") && F.R()->GetView().bCanContinue && F.R()->GetView().Choices.Num() == 0);
	TestTrue(TEXT("speaker is the NPC record's name"), F.R()->GetView().Speaker.ToString() == TEXT("TEST FIXTURE - NONCANON Alpha"));
	TestFalse(TEXT("a second conversation cannot start while one is active"), F.R()->Start(GraphBeta()));
	TestFalse(TEXT("Choose is rejected on a Line node"), F.R()->Choose(FName("c_yes")));
	TestTrue(TEXT("continue"), F.R()->Continue());
	// the silent Branch node ran and took the "first time" path: we are at the choice node
	TestTrue(TEXT("branch took the first-time path to the choice node"), F.R()->GetView().NodeId == FName("n_ask"));
	TestEqual(TEXT("conditional choice hidden (fact not set)"), F.R()->GetView().Choices.Num(), 2);
	TestFalse(TEXT("a hidden choice can never be taken"), F.R()->Choose(FName("c_secret")));
	TestFalse(TEXT("Continue is rejected on a Choice node"), F.R()->Continue());
	TestTrue(TEXT("unknown choice rejected"), !F.R()->Choose(FName("nope")));
	TestTrue(TEXT("choose decline"), F.R()->Choose(FName("c_no")));
	TestTrue(TEXT("lands on the decline line"), F.R()->GetView().NodeId == FName("n_no"));
	TestTrue(TEXT("continue to end"), F.R()->Continue());
	TestTrue(TEXT("completion reported once"), bFinished && Done.Finish == EMRDialogueFinish::Completed && Done.EndNodeId == FName("n_end_no") && Done.CompletionEventId == EvtDecline() && Done.bFirstCompletion);
	TestFalse(TEXT("runtime inactive afterwards"), F.R()->IsActive());
	TestTrue(TEXT("decline offered/accepted nothing"), F.N->GetMissionStatus(Mission()) == EMRQuestStatus::NotOffered);
	TestTrue(TEXT("entry effect set the fact"), F.N->IsFactSet(FactMet()));

	// returning player: the Branch node now takes the other path
	const FMRDialogueResult Again = RunAlpha(F, {});
	TestTrue(TEXT("second run takes the returning branch"), Again.Finish == EMRDialogueFinish::Completed && Again.EndNodeId == FName("n_end_back") && Again.CompletionEventId == EvtBack() && !Again.bFirstCompletion);

	// conditional choice appears when its fact is set; accepting through it activates the mission
	F.N->ResetStateForTest(); F.N->SetFact(FactSecret());
	bool bSawSecret = false; FMRDialogueResult Yes; bool bDone = false;
	F.R()->Start(GraphAlpha(), [&](const FMRDialogueResult& R) { Yes = R; bDone = true; });
	F.R()->Continue();
	bSawSecret = F.R()->GetView().Choices.Num() == 3;
	TestTrue(TEXT("conditional choice offered when its fact is set"), bSawSecret);
	TestTrue(TEXT("choose by index (2 = conditional)"), F.R()->ChooseIndex(1));
	F.R()->Continue();
	TestTrue(TEXT("accept path completes with the accept event"), bDone && Yes.CompletionEventId == EvtAccept() && Yes.EndNodeId == FName("n_end_yes"));
	TestTrue(TEXT("End-node effect accepted the mission"), F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Cancel, "MoonRacer.Narrative.Dialogue.CancelAndRestart", TestFlags)
bool FMRNarr_Cancel::RunTest(const FString&)
{
	FNarr F;
	FMRDialogueResult Res; bool bCalled = false;
	F.R()->Start(GraphAlpha(), [&](const FMRDialogueResult& R) { Res = R; bCalled = true; });
	F.R()->Continue();                                  // now at the choice node, MET effect already fired
	TestTrue(TEXT("one-time entry effect fired before the interruption"), F.N->IsFactSet(FactMet()) && F.N->EffectsApplied == 1);
	F.R()->Cancel(TEXT("player closed the window"));
	TestTrue(TEXT("cancel reports Cancelled exactly once"), bCalled && Res.Finish == EMRDialogueFinish::Cancelled && !F.R()->IsActive());
	TestFalse(TEXT("a cancelled conversation is not recorded as completed"), F.N->GetState().CompletedDialogues.Contains(GraphAlpha()));
	TestEqual(TEXT("cancel counter"), F.R()->NumCancelled, 1);
	F.R()->Cancel(); TestEqual(TEXT("cancel while idle is a no-op"), F.R()->NumCancelled, 1);
	TestFalse(TEXT("Continue/Choose while idle are rejected"), F.R()->Continue() || F.R()->Choose(FName("c_yes")));

	// D-7: restart from the beginning; the one-time effect must NOT fire again
	TestTrue(TEXT("restart"), F.R()->Start(GraphAlpha()));
	TestTrue(TEXT("restarts from the first node (no mid-dialogue resume)"), F.R()->GetView().NodeId == FName("n_start"));
	TestEqual(TEXT("repeat of the one-time effect suppressed"), F.N->EffectsSuppressed, 1);
	TestEqual(TEXT("not applied twice"), F.N->EffectsApplied, 1);
	F.R()->Continue(); F.R()->Choose(FName("c_no")); F.R()->Continue();
	TestTrue(TEXT("the restarted conversation completes normally"), F.N->GetState().CompletedDialogues.Contains(GraphAlpha()) && F.R()->NumCompleted == 1);

	// cancel through the IMRDialogueService seam reports Cancelled
	EMRServiceResult Svc = EMRServiceResult::Ok;
	IMRDialogueService* Seam = F.R();
	TestTrue(TEXT("service reports availability"), Seam->IsDialogueAvailable(GraphBeta()) && !Seam->IsDialogueAvailable(FName("NOPE")));
	Seam->RunDialogue(GraphBeta(), [&](EMRServiceResult R, FName) { Svc = R; });
	TestTrue(TEXT("service sees an active dialogue"), Seam->IsDialogueActive());
	Seam->CancelDialogue();
	TestTrue(TEXT("service result is Cancelled"), Svc == EMRServiceResult::Cancelled && !Seam->IsDialogueActive());
	EMRServiceResult Unknown = EMRServiceResult::Ok; Seam->RunDialogue(FName("NOPE"), [&](EMRServiceResult R, FName) { Unknown = R; });
	TestTrue(TEXT("unknown graph is Unavailable, not a crash"), Unknown == EMRServiceResult::Unavailable);

	// clearing the registry mid-conversation cancels it safely
	F.R()->Start(GraphAlpha()); F.N->ClearRegistry();
	TestFalse(TEXT("registry change cancels the active conversation"), F.R()->IsActive());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_NoDuplicates, "MoonRacer.Narrative.Dialogue.OneTimeEffectsNeverRepeat", TestFlags)
bool FMRNarr_NoDuplicates::RunTest(const FString&)
{
	FNarr F;
	FMRDialogueEffect E; E.Type = EMREffectType::SetFact; E.Subject = FName("TEST_FIXTURE_FACT_X"); E.bOneTime = true; E.EffectId = FName("TEST_FIXTURE_FX_X");
	TestTrue(TEXT("first application"), F.N->ApplyEffect(E));
	F.N->ClearFact(E.Subject);
	TestFalse(TEXT("second application suppressed"), F.N->ApplyEffect(E));
	TestFalse(TEXT("and it did not re-set the fact"), F.N->IsFactSet(E.Subject));
	FMRDialogueEffect NoId = E; NoId.EffectId = NAME_None; TestFalse(TEXT("a one-time effect without an id is ignored, not fired"), F.N->ApplyEffect(NoId));
	FMRDialogueEffect Rep = E; Rep.bOneTime = false; TestTrue(TEXT("a non one-time effect may repeat"), F.N->ApplyEffect(Rep) && F.N->ApplyEffect(Rep));

	// A full completion, then force the conversation to be replayed through its first-time path.
	TestTrue(TEXT("accept path"), RunAlpha(F, { TEXT("c_yes") }).CompletionEventId == EvtAccept());
	TestTrue(TEXT("mission accepted once"), F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active);
	F.N->NotifyGameEvent(EvtObj1());   // progress made after acceptance
	TestTrue(TEXT("objective 1 done"), F.N->IsObjectiveCompleted(Obj1()));
	const int32 Applied = F.N->EffectsApplied, Suppressed = F.N->EffectsSuppressed;
	F.N->StateForTest().CompletedDialogues.Remove(GraphAlpha());   // force the first-time branch again
	TestTrue(TEXT("replay via the accept path"), RunAlpha(F, { TEXT("c_yes") }).CompletionEventId == EvtAccept());
	TestEqual(TEXT("no one-time effect applied again"), F.N->EffectsApplied, Applied);
	TestTrue(TEXT("offer, accept and entry effects were all suppressed"), F.N->EffectsSuppressed >= Suppressed + 3);
	TestTrue(TEXT("mission progress was not reset by the replay"), F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active && F.N->IsObjectiveCompleted(Obj1()));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Missions, "MoonRacer.Narrative.Missions.OfferAcceptAndObjectives", TestFlags)
bool FMRNarr_Missions::RunTest(const FString&)
{
	FNarr F;
	int32 Changes = 0, Done = 0, Tracker = 0; TArray<FName> Events;
	F.N->OnMissionChanged.AddLambda([&](FName, EMRQuestStatus) { ++Changes; });
	F.N->OnObjectiveCompleted.AddLambda([&](FName) { ++Done; });
	F.N->OnTrackerChanged.AddLambda([&]() { ++Tracker; });
	F.N->OnGameEvent.AddLambda([&](FName E) { Events.Add(E); });

	TestFalse(TEXT("nothing tracked before acceptance"), F.N->GetTrackedObjective().bValid);
	TestFalse(TEXT("unknown mission cannot be offered or accepted"), F.N->OfferMission(FName("NOPE")) || F.N->AcceptMission(FName("NOPE")));
	TestFalse(TEXT("objectives cannot complete on an inactive mission"), F.N->CompleteObjective(Obj1()));
	F.N->NotifyGameEvent(EvtObj1()); TestFalse(TEXT("events do nothing to an unaccepted mission"), F.N->IsObjectiveCompleted(Obj1()));
	TestTrue(TEXT("offer"), F.N->OfferMission(Mission()) && F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Offered);
	TestTrue(TEXT("offer is idempotent"), F.N->OfferMission(Mission()) && Changes == 1);
	TestTrue(TEXT("accept"), F.N->AcceptMission(Mission()) && F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active);
	TestTrue(TEXT("accept is idempotent (no second event)"), F.N->AcceptMission(Mission()) && Changes == 2);
	FMRTrackedObjective T = F.N->GetTrackedObjective();
	TestTrue(TEXT("tracker shows the first objective from the string table"), T.bValid && T.ObjectiveId == Obj1() && T.ObjectiveText.ToString() == TEXT("TEST FIXTURE - NONCANON objective one") && T.MissionTitle.IsFromStringTable());
	F.N->NotifyGameEvent(EvtObj2()); TestFalse(TEXT("out-of-order objective event ignored"), F.N->IsObjectiveCompleted(Obj2()));
	TestFalse(TEXT("out-of-order completion rejected"), F.N->CompleteObjective(Obj2()));
	F.N->NotifyGameEvent(EvtObj1());
	TestTrue(TEXT("objective 1 completed by its event"), F.N->IsObjectiveCompleted(Obj1()) && Done == 1);
	TestTrue(TEXT("tracker advanced to objective 2"), F.N->GetTrackedObjective().ObjectiveId == Obj2());
	TestFalse(TEXT("an objective cannot complete twice"), F.N->CompleteObjective(Obj1()));
	F.N->NotifyGameEvent(EvtObj2());
	TestTrue(TEXT("mission completes when its last objective does"), F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Completed && Done == 2 && !F.N->GetTrackedObjective().bValid);
	TestTrue(TEXT("accepting a completed mission never reactivates it"), F.N->AcceptMission(Mission()) && F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Completed);
	TestTrue(TEXT("tracker changes were broadcast"), Tracker >= 4);
	TestTrue(TEXT("game events were broadcast"), Events.Contains(EvtObj1()) && Events.Contains(EvtObj2()));

	// the interaction-service standalone objective
	bool bReached = false; F.N->BeginStandaloneObjective(FName("TEST_FIXTURE_NONCANON_OBJECTIVE"), [&](EMRServiceResult R) { bReached = (R == EMRServiceResult::Ok); });
	TestTrue(TEXT("standalone objective is tracked"), F.N->GetTrackedObjective().bValid);
	TestFalse(TEXT("wrong standalone id ignored"), F.N->ReachStandaloneObjective(FName("OTHER")));
	TestTrue(TEXT("standalone objective reached"), F.N->ReachStandaloneObjective(FName("TEST_FIXTURE_NONCANON_OBJECTIVE")) && bReached && !F.N->GetTrackedObjective().bValid);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Persist, "MoonRacer.Narrative.Persistence.SaveAndResume", TestFlags)
bool FMRNarr_Persist::RunTest(const FString&)
{
	FMRNarrativeState Before;
	{
		FNarr F;
		RunAlpha(F, { TEXT("c_yes") });
		F.N->NotifyGameEvent(EvtObj1());
		TestTrue(TEXT("state was written"), F.N->SaveCount > 0 && F.N->SaveFailures == 0);
		Before = F.N->GetState();
	}
	// "relaunch": brand new subsystem, same slot
	FNarr G(true, /*fresh slot*/ false);
	const FMRNarrativeLoadInfo L = G.N->LoadState();
	TestTrue(TEXT("loaded and verified"), L.Store.bValid && !L.bVersionMismatch);
	TestTrue(TEXT("state identical after relaunch"), G.N->GetState() == Before);
	TestTrue(TEXT("mission still active, objective 1 done, objective 2 current"), G.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active && G.N->GetTrackedObjective().ObjectiveId == Obj2());
	TestTrue(TEXT("completed conversation remembered"), G.N->GetState().CompletedDialogues.Contains(GraphAlpha()));
	const int32 Applied = G.N->EffectsApplied;
	const FMRDialogueResult Replay = RunAlpha(G, {});
	TestTrue(TEXT("returning branch after relaunch"), Replay.EndNodeId == FName("n_end_back"));
	TestEqual(TEXT("one-time ledger survived the relaunch (nothing re-applied)"), G.N->EffectsApplied, Applied);
	G.N->NotifyGameEvent(EvtObj2());
	TestTrue(TEXT("mission completes after resume"), G.N->GetMissionStatus(Mission()) == EMRQuestStatus::Completed);
	// a completed mission loaded from disk is still completed
	FNarr H(true, false); H.N->LoadState();
	TestTrue(TEXT("completed status persisted"), H.N->GetMissionStatus(Mission()) == EMRQuestStatus::Completed);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Corrupt, "MoonRacer.Narrative.Persistence.CorruptAndNewerSavesAreSafe", TestFlags)
bool FMRNarr_Corrupt::RunTest(const FString&)
{
	const FString Path = FMRNarrativeStore::FilePath();
	for (int32 I = 0; I < 6; ++I) IFileManager::Get().Delete(*(Path + (I == 0 ? FString(TEXT(".bak")) : FString::Printf(TEXT(".%d.bak"), I))), false, true, true); // dedicated test slot only
	FNarr F; RunAlpha(F, { TEXT("c_yes") });
	TArray<uint8> Good; FFileHelper::LoadFileToArray(Good, *Path);
	TestTrue(TEXT("a valid envelope was written (MRNV)"), Good.Num() > 16 && Good[0] == 'M' && Good[1] == 'R' && Good[2] == 'N' && Good[3] == 'V');

	auto Probe = [&](const TCHAR* Label, const TArray<uint8>& Bytes, bool bExpectCorrupt)
	{
		FFileHelper::SaveArrayToFile(Bytes, *Path);
		FNarr X(true, false);
		const FMRNarrativeLoadInfo L = X.N->LoadState();      // must not crash
		TestFalse(FString(Label) + TEXT(": not loaded"), L.Store.bValid);
		TestTrue(FString(Label) + TEXT(": classified"), bExpectCorrupt ? L.Store.bCorrupt : L.Store.bRejectedNewer);
		TestTrue(FString(Label) + TEXT(": fresh state"), X.N->GetState().Facts.Num() == 0 && X.N->GetMissionStatus(Mission()) == EMRQuestStatus::NotOffered);
		TArray<uint8> After; FFileHelper::LoadFileToArray(After, *Path);
		TestTrue(FString(Label) + TEXT(": file preserved untouched by the load"), After == Bytes);
	};
	Probe(TEXT("empty"), TArray<uint8>(), true);
	{ TArray<uint8> T; T.Append(Good.GetData(), 10); Probe(TEXT("truncated header"), T, true); }
	{ TArray<uint8> T; T.Append(Good.GetData(), Good.Num() - 5); Probe(TEXT("truncated payload"), T, true); }
	{ TArray<uint8> G; for (int32 I = 0; I < 600; ++I) G.Add((uint8)(I * 131 + 7)); Probe(TEXT("garbage"), G, true); }
	{ TArray<uint8> M = Good; M[M.Num() / 2] ^= 0x40; Probe(TEXT("modified payload"), M, true); }
	{ TArray<uint8> M = Good; M[12] ^= 0xFF; Probe(TEXT("wrong checksum"), M, true); }
	{ TArray<uint8> M = Good; M[4] = 9; Probe(TEXT("unsupported envelope format"), M, true); }

	// A corrupt file is backed up (never silently discarded) before a new save replaces it.
	{
		TArray<uint8> Garbage; for (int32 I = 0; I < 100; ++I) Garbage.Add((uint8)(I * 17 + 3));
		FFileHelper::SaveArrayToFile(Garbage, *Path);
		FNarr X(true, false); X.N->LoadState(); X.N->SetFact(FName("TEST_FIXTURE_FACT_AFTER_CORRUPT"));
		TArray<uint8> Bak; const bool bBak = FFileHelper::LoadFileToArray(Bak, *(Path + TEXT(".bak")));
		TestTrue(TEXT("the corrupt original was preserved as .bak"), bBak && Bak == Garbage);
		FNarr Y(true, false); TestTrue(TEXT("the new save is valid and loads"), Y.N->LoadState().Store.bValid && Y.N->IsFactSet(FName("TEST_FIXTURE_FACT_AFTER_CORRUPT")));
	}
	// A save from a NEWER build is never overwritten.
	{
		FNarr Z; UMRNarrativeSaveGame* Newer = NewObject<UMRNarrativeSaveGame>(GetTransientPackage()); Newer->SaveVersion = MRNarrative::CurrentNarrativeSaveVersion + 5; Newer->Facts = { FName("FROM_THE_FUTURE") }; Newer->Checksum = Newer->ComputeChecksum();
		FMRNarrativeStore::WriteForTest(Newer);
		TArray<uint8> Before; FFileHelper::LoadFileToArray(Before, *Path);
		const FMRNarrativeLoadInfo L = Z.N->LoadState();
		TestTrue(TEXT("newer save rejected, not loaded"), L.Store.bRejectedNewer && !Z.N->IsFactSet(FName("FROM_THE_FUTURE")));
		Z.N->SetFact(FName("TEST_FIXTURE_FACT_X")); TestTrue(TEXT("saving refuses to overwrite it"), Z.N->SaveFailures > 0 && Z.N->LastSaveError.Contains(TEXT("newer")));
		TArray<uint8> After; FFileHelper::LoadFileToArray(After, *Path); TestTrue(TEXT("newer save byte-identical"), After == Before);
	}
	FMRNarrativeStore::Delete();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Interrupted, "MoonRacer.Narrative.Persistence.InterruptedWriteKeepsPreviousSave", TestFlags)
bool FMRNarr_Interrupted::RunTest(const FString&)
{
	FNarr F; F.N->SetFact(FName("TEST_FIXTURE_FACT_A"));
	TArray<uint8> Prev; FFileHelper::LoadFileToArray(Prev, *FMRNarrativeStore::FilePath());
	FMRNarrativeStore::GFailAfterTempWrite = true;
	F.N->SetFact(FName("TEST_FIXTURE_FACT_B"));
	FMRNarrativeStore::GFailAfterTempWrite = false;
	TestTrue(TEXT("the write failed and was reported"), F.N->SaveFailures == 1 && !F.N->LastSaveError.IsEmpty());
	TestTrue(TEXT("state kept in memory"), F.N->IsFactSet(FName("TEST_FIXTURE_FACT_B")));
	TArray<uint8> Now; FFileHelper::LoadFileToArray(Now, *FMRNarrativeStore::FilePath());
	TestTrue(TEXT("previous valid save byte-identical"), Now == Prev);
	FNarr G(true, false); G.N->LoadState();
	TestTrue(TEXT("relaunch restores the last good state (A, not B)"), G.N->IsFactSet(FName("TEST_FIXTURE_FACT_A")) && !G.N->IsFactSet(FName("TEST_FIXTURE_FACT_B")));
	F.N->SetFact(FName("TEST_FIXTURE_FACT_C"));   // the next write succeeds and carries everything
	FNarr H(true, false); H.N->LoadState();
	TestTrue(TEXT("the next successful save carries all state"), H.N->IsFactSet(FName("TEST_FIXTURE_FACT_B")) && H.N->IsFactSet(FName("TEST_FIXTURE_FACT_C")));
	FMRNarrativeStore::Delete();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_NarrativeVersions, "MoonRacer.Narrative.ContentVersion.NarrativeStateKeptOnMismatch", TestFlags)
bool FMRNarr_NarrativeVersions::RunTest(const FString&)
{
	{ FNarr F; RunAlpha(F, { TEXT("c_yes") }); F.N->NotifyGameEvent(EvtObj1()); }
	// same mission/dialogue content, new version
	FNarr G(false, false);
	G.Bundle = Build(G.GI.Get(), FName("TEST_FIXTURE_V2"));
	FMRValidationReport R; TestTrue(TEXT("v2 bundle registers"), G.N->RegisterBundle(G.Bundle, FMRValidationPolicy(), R));
	const FMRNarrativeLoadInfo L = G.N->LoadState();
	TestTrue(TEXT("mismatch detected"), L.bVersionMismatch && L.Store.SavedDialogueVersion == Version());
	TestTrue(TEXT("progress NOT reset (mission, objective, ledger kept)"), G.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active && G.N->IsObjectiveCompleted(Obj1()) && G.N->GetState().FiredEffects.Contains(FxAccept()));
	FNarr H(true, false); const FMRNarrativeLoadInfo L2 = H.N->LoadState();   // H registers V1 again: the file was re-stamped as V2
	TestTrue(TEXT("the save was re-stamped with the new versions"), L2.bVersionMismatch && L2.Store.SavedDialogueVersion == FName("TEST_FIXTURE_V2"));

	// content that no longer contains the mission: its status is kept but not applied
	FNarr M(false, false);
	// rebuild a valid bundle without the mission and without effects that reference it
	M.Bundle.Missions.Empty();
	for (UMRDialogueGraph* Gr : M.Bundle.Graphs) for (FMRDialogueNode& N : Gr->Nodes) { N.OnEnterEffects.RemoveAll([](const FMRDialogueEffect& E) { return E.Type == EMREffectType::AcceptMission || E.Type == EMREffectType::OfferMission; }); for (FMRDialogueChoice& C : N.Choices) C.Effects.RemoveAll([](const FMRDialogueEffect& E) { return E.Type == EMREffectType::OfferMission; }); }
	M.Bundle.Missions.Empty();
	FMRValidationReport R3; TestTrue(TEXT("bundle without the mission registers"), M.N->RegisterBundle(M.Bundle, FMRValidationPolicy(), R3));
	const FMRNarrativeLoadInfo L3 = M.N->LoadState();
	TestTrue(TEXT("unknown mission reported, not applied, not deleted"), L3.UnknownMissions.Contains(Mission()) && M.N->FindMission(Mission()) == nullptr && M.N->GetState().Missions.Contains(Mission()));
	TestFalse(TEXT("nothing tracked for unknown content"), M.N->GetTrackedObjective().bValid);
	FMRNarrativeStore::Delete();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_OnbVersions, "MoonRacer.Narrative.ContentVersion.OnboardingCheckpointRestore", TestFlags)
bool FMRNarr_OnbVersions::RunTest(const FString&)
{
	const TCHAR* Base = TEXT("MRProgress_NarrativeAutomation");
	FMRContentVersions V1, V2; V1.QuestRegistryVersion = V1.DialogueVersion = FName("TEST_FIXTURE_V1"); V2.QuestRegistryVersion = V2.DialogueVersion = FName("TEST_FIXTURE_V2");

	// ---- in-progress checkpoint written against V1, restored against V2: progress kept, stale safe spawn not trusted
	{
		FOnb A(Base); A.S->ExpectedVersions = V1; A.Interact()->bAutoComplete = false; A.S->Begin();
		TestTrue(TEXT("v1 run paused at the first objective"), A.S->GetState() == EMROnboardingState::FirstObjective);
		TestTrue(TEXT("checkpoint stamped with v1"), A.S->GetRecord().Content == V1);
		const FName SavedSpawn = A.S->GetRecord().LastSafeSpawn.SpawnPointId;
		const FMRAvatarRef Ref = A.S->GetRecord().AvatarRef;

		auto Relaunch = [&](const FMRContentVersions& Expected, TStrongObjectPtr<UGameInstance>& GI, TStrongObjectPtr<UMROnboardingSubsystem>& S)
		{
			GI.Reset(NewObject<UGameInstance>(GetTransientPackage())); S.Reset(NewObject<UMROnboardingSubsystem>(GI.Get()));
			S->UseDevServices(nullptr); S->bLoadContentFromAsset = false;
			Cast<UMRDevAvatarFlowService>(S->AvatarService)->ForcedRef = Ref;
			Cast<UMRDevInteractionService>(S->InteractionService)->bAutoComplete = false;
			S->ExpectedVersions = Expected; S->Begin();
		};
		TStrongObjectPtr<UGameInstance> GI2, GI3; TStrongObjectPtr<UMROnboardingSubsystem> S2, S3;
		Relaunch(V2, GI2, S2);
		TestTrue(TEXT("mismatch detected"), S2->bContentVersionMismatch && S2->ContentVersionNotes.Num() == 1);
		TestTrue(TEXT("progress NOT reset: still resumes at the first objective"), S2->GetState() == EMROnboardingState::FirstObjective && S2->GetRecord().Flags.bCoreSpawned && S2->GetRecord().Flags.bAvatarConfirmed);
		TestTrue(TEXT("the stale safe spawn was not trusted (default spawn requested)"), Cast<UMRDevSpawnService>(S2->SpawnService)->LastRequestedSpawn == S2->Content.DefaultSpawnId);
		TestTrue(TEXT("the checkpoint is re-stamped with v2 on the transition"), S2->GetRecord().Content == V2);
		TestFalse(TEXT("not treated as a fresh start"), S2->GetLoadReport().bFallbackFresh);

		// matching restore (regression): saved safe spawn used, no mismatch. (S2 re-stamped the checkpoint to V2, so V2 matches now.)
		Relaunch(V2, GI3, S3);
		TestFalse(TEXT("matching versions: no mismatch"), S3->bContentVersionMismatch);
		TestTrue(TEXT("matching versions: saved safe spawn is used"), Cast<UMRDevSpawnService>(S3->SpawnService)->LastRequestedSpawn == S3->GetRecord().LastSafeSpawn.SpawnPointId);
		(void)SavedSpawn;
	}

	// ---- completed onboarding survives a version change (never silently reset)
	{
		FOnb C(Base); C.S->ExpectedVersions = V1; C.S->Begin();
		TestTrue(TEXT("v1 onboarding completed"), C.S->GetState() == EMROnboardingState::FreeExplore && C.S->GetRecord().Flags.bOnboardingCompleted);
		TStrongObjectPtr<UGameInstance> GI2(NewObject<UGameInstance>(GetTransientPackage()));
		TStrongObjectPtr<UMROnboardingSubsystem> S2(NewObject<UMROnboardingSubsystem>(GI2.Get()));
		S2->UseDevServices(nullptr); S2->bLoadContentFromAsset = false; S2->ExpectedVersions = V2; S2->Begin();
		TestTrue(TEXT("completed player stays completed after a content change"), S2->bContentVersionMismatch && S2->GetState() == EMROnboardingState::FreeExplore && S2->GetRecord().Flags.bOnboardingCompleted);
		UMRDevCinematicService* Cine = Cast<UMRDevCinematicService>(S2->CinematicService);
		TestEqual(TEXT("nothing is replayed"), Cine->PlayCount, 0);
	}

	// ---- a fresh start never reports a mismatch
	{
		FOnb D(Base); D.S->ExpectedVersions = V2; D.Interact()->bAutoComplete = false; D.S->Begin();
		TestFalse(TEXT("fresh record: no mismatch"), D.S->bContentVersionMismatch);
	}
	FMRProgressStore::DeleteBoth();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_OnbBinding, "MoonRacer.Narrative.Onboarding.NarrativeServicesReachFreeExplore", TestFlags)
bool FMRNarr_OnbBinding::RunTest(const FString&)
{
	FNarr N;
	FOnb O(TEXT("MRProgress_NarrativeAutomation"));
	MRNarrative::BindOnboarding(O.S.Get(), N.N.Get());
	O.S->Content.FirstContactNpcId = NpcAlpha(); O.S->Content.FirstContactDialogueId = GraphAlpha();
	O.S->Content.HandoffNpcId = NpcBeta(); O.S->Content.HandoffDialogueId = GraphBeta(); O.S->Content.FirstMissionId = Mission();
	TestTrue(TEXT("expected versions adopted from the registry"), O.S->ExpectedVersions == N.N->GetContentVersions());
	O.S->Begin();
	TestTrue(TEXT("waits at the first objective (narrative interaction service)"), O.S->GetState() == EMROnboardingState::FirstObjective);
	TestTrue(TEXT("tracker shows the standalone objective"), N.N->GetTrackedObjective().bValid);
	TestTrue(TEXT("objective reached"), N.N->ReachStandaloneObjective(O.S->Content.ObjectiveId));
	TestTrue(TEXT("first conversation is running"), O.S->GetState() == EMROnboardingState::TavianDialogue && N.R()->IsActive() && N.R()->GetView().GraphId == GraphAlpha());

	// interruption: the state machine blocks (retryable) and the conversation restarts from the beginning (D-7)
	N.R()->Continue(); N.R()->Cancel(TEXT("test interruption"));
	TestTrue(TEXT("interrupted dialogue blocks onboarding, retryable"), O.S->IsBlocked() && O.S->IsBlockRetryable() && O.S->GetBlockReason().Contains(TEXT("interrupted")));
	TestTrue(TEXT("state unchanged, nothing recorded"), O.S->GetState() == EMROnboardingState::TavianDialogue && !O.S->GetRecord().Flags.bTavianIntroduced);
	O.S->Retry();
	TestTrue(TEXT("retry restarts the conversation from its first node"), N.R()->IsActive() && N.R()->GetView().NodeId == FName("n_start"));
	const int32 Suppressed = N.N->EffectsSuppressed; TestTrue(TEXT("the one-time entry effect did not repeat"), Suppressed >= 1);

	// play it through and accept
	N.R()->Continue(); N.R()->Choose(FName("c_yes")); N.R()->Continue();
	TestTrue(TEXT("mission accepted by the dialogue's end-node effect"), N.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active);
	TestTrue(TEXT("onboarding advanced to the handoff conversation"), O.S->GetState() == EMROnboardingState::BartenderHandoff && N.R()->IsActive() && N.R()->GetView().GraphId == GraphBeta());
	N.R()->Continue();
	TestTrue(TEXT("D-6: reaches FREE_EXPLORE on acceptance"), O.S->GetState() == EMROnboardingState::FreeExplore && O.S->GetRecord().Flags.bOnboardingCompleted);
	TestTrue(TEXT("mission is Active, not completed"), O.S->GetRecord().Flags.FirstQuestStatus == EMRQuestStatus::Active && N.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active);
	TestTrue(TEXT("checkpoint stamped with the narrative versions"), O.S->GetRecord().Content == N.N->GetContentVersions());
	TestEqual(TEXT("accept effect applied exactly once"), N.N->GetState().FiredEffects.Contains(FxAccept()) ? 1 : 0, 1);

	// missing content blocks safely instead of inventing it
	FNarr M; FOnb P(TEXT("MRProgress_NarrativeAutomation")); MRNarrative::BindOnboarding(P.S.Get(), M.N.Get());
	P.S->Content.FirstContactNpcId = NpcAlpha(); P.S->Content.FirstContactDialogueId = GraphAlpha(); P.S->Content.HandoffNpcId = NpcBeta(); P.S->Content.HandoffDialogueId = GraphBeta(); P.S->Content.FirstMissionId = FName("TEST_FIXTURE_MISSING_MISSION");
	P.S->Begin(); M.N->ReachStandaloneObjective(P.S->Content.ObjectiveId); M.R()->Continue(); M.R()->Choose(FName("c_no")); M.R()->Continue(); M.R()->Continue();
	TestTrue(TEXT("unknown mission blocks first-mission, retryable, nothing invented"), P.S->GetState() == EMROnboardingState::FirstMission && P.S->IsBlocked() && !P.S->GetRecord().Flags.bOnboardingCompleted);
	FNarr U; FOnb Q(TEXT("MRProgress_NarrativeAutomation")); MRNarrative::BindOnboarding(Q.S.Get(), U.N.Get());
	Q.S->Content.FirstContactNpcId = FName("TEST_FIXTURE_MISSING_NPC"); Q.S->Content.FirstContactDialogueId = GraphAlpha();
	Q.S->Begin(); U.N->ReachStandaloneObjective(Q.S->Content.ObjectiveId);
	TestTrue(TEXT("unknown NPC blocks the conversation state"), Q.S->GetState() == EMROnboardingState::TavianDialogue && Q.S->IsBlocked() && Q.S->GetBlockReason().Contains(TEXT("NPC unavailable")));
	FMRProgressStore::DeleteBoth(); FMRNarrativeStore::Delete();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRNarr_Interfaces, "MoonRacer.Narrative.Compatibility.ExistingDialogueSeamUnchanged", TestFlags)
bool FMRNarr_Interfaces::RunTest(const FString&)
{
	TStrongObjectPtr<UMRDevDialogueService> Dev(NewObject<UMRDevDialogueService>(GetTransientPackage()));
	IMRDialogueService* Seam = Dev.Get();
	TestFalse(TEXT("legacy implementations default to not-active"), Seam->IsDialogueActive());
	Seam->CancelDialogue();   // default no-op must be safe
	EMRServiceResult R = EMRServiceResult::Failed; FName End;
	Seam->RunDialogue(FName("TEST_FIXTURE_NONCANON_DIALOGUE_A"), [&](EMRServiceResult X, FName E) { R = X; End = E; });
	TestTrue(TEXT("legacy fixture dialogue still completes Ok"), R == EMRServiceResult::Ok);
	TestTrue(TEXT("Cancelled is a distinct result"), EMRServiceResult::Cancelled != EMRServiceResult::Failed && EMRServiceResult::Cancelled != EMRServiceResult::Unavailable);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
