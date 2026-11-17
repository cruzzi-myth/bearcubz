#include "Dev/MRNarrativeFixtures.h"
#include "Internationalization/StringTableRegistry.h"

namespace
{
	using namespace MRNarrativeFixtures;
	void Str(FName Omit, const TCHAR* Key, const TCHAR* Text)
	{
		if (Omit == FName(Key)) return;
		FStringTableRegistry::Get().Internal_SetLocTableEntry(TableId(), FTextKey(Key), FString(Text));
	}

	void Header(UMRNarrativeRecordBase* R, FName Id, FName Version)
	{
		R->RecordId = Id; R->ContentVersion = Version; R->bTestFixture = true;
		R->Provenance.SourceDocumentId = FName("TEST_FIXTURE_NONCANON"); R->Provenance.Note = TEXT("TEST FIXTURE - NONCANON; not Moon Racer canon");
	}
	FMRDialogueEffect Fx(EMREffectType T, FName Subject, FName Id = NAME_None) { FMRDialogueEffect E; E.Type = T; E.Subject = Subject; if (!Id.IsNone()) { E.bOneTime = true; E.EffectId = Id; } return E; }
	FMRDialogueCondition Cond(EMRConditionType T, FName Subject) { FMRDialogueCondition C; C.Type = T; C.Subject = Subject; return C; }
	FMRDialogueNode Line(const TCHAR* Id, FName Speaker, const TCHAR* Key, const TCHAR* Next) { FMRDialogueNode N; N.NodeId = Id; N.Type = EMRDialogueNodeType::Line; N.SpeakerNpcId = Speaker; N.TextKey = Key; N.NextNodeId = Next; return N; }
	FMRDialogueNode End(const TCHAR* Id, FName Event) { FMRDialogueNode N; N.NodeId = Id; N.Type = EMRDialogueNodeType::End; N.CompletionEventId = Event; return N; }
	FMRDialogueChoice Choice(const TCHAR* Id, FName Key, const TCHAR* Next) { FMRDialogueChoice C; C.ChoiceId = Id; C.TextKey = Key; C.NextNodeId = Next; return C; }
}

void MRNarrativeFixtures::RegisterStrings(FName Omit)
{
	// Registering an id twice hard-asserts in the engine, so drop any previous table first.
	FStringTableRegistry::Get().UnregisterStringTable(TableId());
	FStringTableRegistry::Get().Internal_NewLocTable(TableId(), FTextKey(TEXT("TestFixtureNarrative")));
	Str(Omit, TEXT("npc_alpha_name"), TEXT("TEST FIXTURE - NONCANON Alpha"));
	Str(Omit, TEXT("npc_beta_name"), TEXT("TEST FIXTURE - NONCANON Beta"));
	Str(Omit, TEXT("alpha_1"), TEXT("TEST FIXTURE - NONCANON: alpha line one (placeholder, not Moon Racer dialogue)."));
	Str(Omit, TEXT("alpha_back"), TEXT("TEST FIXTURE - NONCANON: alpha returning line (placeholder)."));
	Str(Omit, TEXT("alpha_ask"), TEXT("TEST FIXTURE - NONCANON: alpha question (placeholder)."));
	Str(Omit, TEXT("alpha_no"), TEXT("TEST FIXTURE - NONCANON: alpha reply to decline (placeholder)."));
	Str(Omit, TEXT("resp_yes"), TEXT("TEST FIXTURE - NONCANON: response yes"));
	Str(Omit, TEXT("resp_secret"), TEXT("TEST FIXTURE - NONCANON: conditional response"));
	Str(Omit, TEXT("resp_no"), TEXT("TEST FIXTURE - NONCANON: response no"));
	Str(Omit, TEXT("player_yes"), TEXT("TEST FIXTURE - NONCANON: player line (placeholder)."));
	Str(Omit, TEXT("beta_1"), TEXT("TEST FIXTURE - NONCANON: beta line (placeholder)."));
	Str(Omit, TEXT("mission_title"), TEXT("TEST FIXTURE - NONCANON mission"));
	Str(Omit, TEXT("mission_summary"), TEXT("TEST FIXTURE - NONCANON: placeholder mission summary"));
	Str(Omit, TEXT("obj_1"), TEXT("TEST FIXTURE - NONCANON objective one"));
	Str(Omit, TEXT("obj_2"), TEXT("TEST FIXTURE - NONCANON objective two"));
}

FMRNarrativeBundle MRNarrativeFixtures::Build(UObject* Outer, FName V)
{
	FMRNarrativeBundle B;
	auto Npc = [&](FName Id, const TCHAR* NameKey, FName Graph) { UMRNpcRecord* N = NewObject<UMRNpcRecord>(Outer); Header(N, Id, V); N->StringTableId = TableId(); N->DisplayNameKey = NameKey; N->DefaultDialogueGraphId = Graph; B.Npcs.Add(N); };
	Npc(NpcAlpha(), TEXT("npc_alpha_name"), GraphAlpha());
	Npc(NpcBeta(), TEXT("npc_beta_name"), GraphBeta());

	// ALPHA: start -> gate(branch: returning vs first) -> ask(choices) -> yes/secret -> end(accept) | no -> end(decline)
	{
		UMRDialogueGraph* G = NewObject<UMRDialogueGraph>(Outer); Header(G, GraphAlpha(), V);
		G->NpcId = NpcAlpha(); G->StringTableId = TableId(); G->StartNodeId = TEXT("n_start");
		FMRDialogueNode Start = Line(TEXT("n_start"), NpcAlpha(), TEXT("alpha_1"), TEXT("n_gate")); Start.OnEnterEffects.Add(Fx(EMREffectType::SetFact, FactMet(), FxMet()));
		FMRDialogueNode Gate; Gate.NodeId = TEXT("n_gate"); Gate.Type = EMRDialogueNodeType::Branch;
		FMRDialogueChoice BRet = Choice(TEXT("b_return"), NAME_None, TEXT("n_back")); BRet.Conditions.Add(Cond(EMRConditionType::DialogueCompleted, GraphAlpha()));
		FMRDialogueChoice BFirst = Choice(TEXT("b_first"), NAME_None, TEXT("n_ask"));
		Gate.Choices = { BRet, BFirst };
		FMRDialogueNode Ask; Ask.NodeId = TEXT("n_ask"); Ask.Type = EMRDialogueNodeType::Choice; Ask.SpeakerNpcId = NpcAlpha(); Ask.TextKey = TEXT("alpha_ask");
		FMRDialogueChoice Yes = Choice(TEXT("c_yes"), TEXT("resp_yes"), TEXT("n_yes")); Yes.Effects.Add(Fx(EMREffectType::OfferMission, Mission(), FxOffer()));
		FMRDialogueChoice Secret = Choice(TEXT("c_secret"), TEXT("resp_secret"), TEXT("n_yes")); Secret.Conditions.Add(Cond(EMRConditionType::FactSet, FactSecret()));
		FMRDialogueChoice No = Choice(TEXT("c_no"), TEXT("resp_no"), TEXT("n_no"));
		Ask.Choices = { Yes, Secret, No };
		FMRDialogueNode YesLine = Line(TEXT("n_yes"), NAME_None, TEXT("player_yes"), TEXT("n_end_yes"));
		FMRDialogueNode EndYes = End(TEXT("n_end_yes"), EvtAccept()); EndYes.OnEnterEffects.Add(Fx(EMREffectType::AcceptMission, Mission(), FxAccept()));
		G->Nodes = { Start, Gate, Line(TEXT("n_back"), NpcAlpha(), TEXT("alpha_back"), TEXT("n_end_back")), End(TEXT("n_end_back"), EvtBack()), Ask, YesLine, EndYes,
			Line(TEXT("n_no"), NpcAlpha(), TEXT("alpha_no"), TEXT("n_end_no")), End(TEXT("n_end_no"), EvtDecline()) };
		B.Graphs.Add(G);
	}
	{
		UMRDialogueGraph* G = NewObject<UMRDialogueGraph>(Outer); Header(G, GraphBeta(), V);
		G->NpcId = NpcBeta(); G->StringTableId = TableId(); G->StartNodeId = TEXT("n_b1");
		G->Nodes = { Line(TEXT("n_b1"), NpcBeta(), TEXT("beta_1"), TEXT("n_b_end")), End(TEXT("n_b_end"), EvtBetaDone()) };
		B.Graphs.Add(G);
	}
	{
		UMRMissionRecord* M = NewObject<UMRMissionRecord>(Outer); Header(M, Mission(), V);
		M->StringTableId = TableId(); M->TitleKey = TEXT("mission_title"); M->SummaryKey = TEXT("mission_summary"); M->OfferingNpcId = NpcAlpha();
		FMRObjectiveDef O1; O1.ObjectiveId = Obj1(); O1.TextKey = TEXT("obj_1"); O1.CompletionEventId = EvtObj1();
		FMRObjectiveDef O2; O2.ObjectiveId = Obj2(); O2.TextKey = TEXT("obj_2"); O2.CompletionEventId = EvtObj2();
		M->Objectives = { O1, O2 };
		B.Missions.Add(M);
	}
	return B;
}
