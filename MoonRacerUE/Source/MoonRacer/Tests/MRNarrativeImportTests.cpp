// Moon Racer - P5B-0 narrative import pipeline tests. Run:
//   UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer.NarrativeImport; Quit" -unattended -nullrhi -nosplash -nosound
// Source: NarrativeSource/TEST_FIXTURE_BUNDLE (TEST FIXTURE - NONCANON). Working copies live under Saved/NarrativeImportTest; generated test assets under
// /Game/MoonRacer/Narrative/_ImportTest (removed by the tests). Dedicated save slots only.
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Dev/MRNarrativeFixtures.h"
#include "Dom/JsonObject.h"
#include "Engine/GameInstance.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"
#include "Narrative/Import/MRNarrativeImporter.h"
#include "Narrative/Registration/MRNarrativeRegistrar.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "UObject/StrongObjectPtr.h"

// File-local test code lives in a uniquely named namespace so that unity builds (which merge .cpp files)
// cannot see helpers such as TestFlags/TestSlot/Good from other test files.
namespace MRNarrativeImportTestUnit
{
namespace
{
	constexpr EAutomationTestFlags TestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;
	using namespace MRNarrativeFixtures;
	using FJ = TSharedPtr<FJsonObject>;

	FString FixtureSrc() { return FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("NarrativeSource/TEST_FIXTURE_BUNDLE")); }
	FString WorkDir(const FString& Case) { return FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir() / TEXT("NarrativeImportTest") / Case); }
	FString OutRoot(const FString& Case) { return TEXT("/Game/MoonRacer/Narrative/_ImportTest/") + Case; }
	const TCHAR* BundleId = TEXT("TEST_FIXTURE_BUNDLE");
	const TArray<FString>& Files() { static const TArray<FString> F = { TEXT("bundle.json"), TEXT("strings.json"), TEXT("npcs.json"), TEXT("dialogues.json"), TEXT("missions.json") }; return F; }

	void Clean(const FString& Case)
	{
		IFileManager::Get().DeleteDirectory(*WorkDir(Case), false, true);
		IFileManager::Get().DeleteDirectory(*FPaths::ConvertRelativePathToFull(FPackageName::LongPackageNameToFilename(OutRoot(Case), TEXT(""))), false, true);
		IFileManager::Get().DeleteDirectory(*FPaths::ConvertRelativePathToFull(FPackageName::LongPackageNameToFilename(TEXT("/Game/MoonRacer/Narrative/_ImportTest"), TEXT(""))), false, false); // only if now empty
	}
	// a working copy of the fixture bundle
	FString Copy(const FString& Case)
	{
		Clean(Case);
		const FString Dst = WorkDir(Case) / TEXT("src");
		for (const FString& F : Files()) IFileManager::Get().Copy(*(Dst / F), *(FixtureSrc() / F));
		return Dst;
	}
	FJ LoadJ(const FString& Path) { FString T; FFileHelper::LoadFileToString(T, *Path); FJ O; FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(T), O); return O; }
	void MutArr(const FJ& O, const TCHAR* Field, TFunction<void(TArray<TSharedPtr<FJsonValue>>&)> Fn) { TArray<TSharedPtr<FJsonValue>> A = O->GetArrayField(Field); Fn(A); O->SetArrayField(Field, A); }
	bool SameSet(const TSet<FName>& A, const TSet<FName>& B) { return A.Num() == B.Num() && A.Includes(B); }
	void SaveJ(const FString& Path, const FJ& O) { FString T; FJsonSerializer::Serialize(O.ToSharedRef(), TJsonWriterFactory<>::Create(&T)); FFileHelper::SaveStringToFile(T, *Path); }
	// recompute the manifest hashes of the listed files that exist (as a reviewer would after an approved change)
	void Rehash(const FString& Dir)
	{
		FJ M = LoadJ(Dir / TEXT("bundle.json"));
		for (const TSharedPtr<FJsonValue>& V : M->GetArrayField(TEXT("files")))
		{ const FJ F = V->AsObject(); const FString H = FMRNarrativeImporter::Sha1OfFile(Dir / F->GetStringField(TEXT("path"))); if (!H.IsEmpty()) F->SetStringField(TEXT("sha1"), H); }
		SaveJ(Dir / TEXT("bundle.json"), M);
	}
	void Replace(const FString& Dir, const FString& File, const FString& Find, const FString& With, bool bRehash = true)
	{
		FString T; FFileHelper::LoadFileToString(T, *(Dir / File)); check(T.Contains(Find)); T = T.Replace(*Find, *With); FFileHelper::SaveStringToFile(T, *(Dir / File));
		if (bRehash && File != TEXT("bundle.json")) Rehash(Dir);
	}
	void EditJ(const FString& Dir, const FString& File, TFunction<void(const FJ&)> Fn) { FJ O = LoadJ(Dir / File); Fn(O); SaveJ(Dir / File, O); if (File != TEXT("bundle.json")) Rehash(Dir); }
	FMRImportOptions Opts(const FString& Dir, const FString& Case, bool bCommit = true) { FMRImportOptions O; O.SourceDir = Dir; O.OutputRoot = OutRoot(Case); O.bCommit = bCommit; return O; }
	bool NothingWritten(const FString& Case) { return !IFileManager::Get().DirectoryExists(*FMRNarrativeImporter::BundleDir(OutRoot(Case), BundleId)); }
	FString HashFile(const FString& P) { return FMRNarrativeImporter::Sha1OfFile(P); }

	struct FScopedFail { explicit FScopedFail(int32 N) { FMRNarrativeImporter::GFailAfterAssets = N; } ~FScopedFail() { FMRNarrativeImporter::GFailAfterAssets = -1; } };

	struct FNar
	{
		TStrongObjectPtr<UGameInstance> GI; TStrongObjectPtr<UMRNarrativeSubsystem> N;
		FNar() { FMRNarrativeStore::SetSlotBaseOverride(TEXT("MRNarrative_ImportTest")); GI.Reset(NewObject<UGameInstance>(GetTransientPackage())); N.Reset(NewObject<UMRNarrativeSubsystem>(GI.Get())); N->Setup(); }
	};
}

// ---------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRImp_Valid, "MoonRacer.NarrativeImport.Import.ValidFixtureBundle", TestFlags)
bool FMRImp_Valid::RunTest(const FString&)
{
	const FString C = TEXT("Valid"); Clean(C);
	const FMRImportReport R = FMRNarrativeImporter::Import(Opts(FixtureSrc(), C));
	TestTrue(TEXT("imported"), R.Outcome == EMRImportOutcome::Imported && R.Validation.NumErrors() == 0 && R.BundleId == BundleId);
	TestEqual(TEXT("6 assets written (2 NPC, 2 dialogue, 1 mission, 1 string table)"), R.GeneratedAssets.Num(), 6);
	for (const FString& A : R.GeneratedAssets) TestTrue(TEXT("asset file exists: ") + A, IFileManager::Get().FileExists(*FPackageName::LongPackageNameToFilename(A, FPackageName::GetAssetPackageExtension())));
	const FMRActiveReceipt Rc = FMRNarrativeImporter::ReadActive(OutRoot(C), BundleId);
	TestTrue(TEXT("ACTIVE receipt written with stable ids and versions"), Rc.bValid && Rc.DialogueVersion == TEXT("TEST_FIXTURE_V1") && Rc.QuestVersion == TEXT("TEST_FIXTURE_V1") && Rc.Classification == TEXT("TEST_FIXTURE") && Rc.Records.Contains(TEXT("npc:TEST_FIXTURE_NPC_ALPHA")) && Rc.Records.Contains(TEXT("mission:TEST_FIXTURE_MISSION")));

	FMRNarrativeBundle B; FMRValidationReport V;
	TestTrue(TEXT("active bundle loads from the generated assets"), FMRNarrativeImporter::LoadActive(OutRoot(C), BundleId, B, V, false));
	TestTrue(TEXT("2 NPCs, 2 dialogues, 1 mission"), B.Npcs.Num() == 2 && B.Graphs.Num() == 2 && B.Missions.Num() == 1);
	TestTrue(TEXT("records carry fixture flag, version, and source hash"), B.Npcs[0]->bTestFixture && B.Npcs[0]->ContentVersion == Version() && !B.Npcs[0]->SourceRecordHash.IsEmpty());

	// the imported content behaves exactly like the P5A code fixtures
	FNar F; FMRNarrativeStore::Delete();
	FMRValidationReport Reg; TestTrue(TEXT("registers"), F.N->RegisterBundle(B, FMRValidationPolicy(), Reg));
	TestTrue(TEXT("versions come from the bundle"), F.N->GetContentVersions().DialogueVersion == Version());
	FMRDialogueResult Res; bool bDone = false;
	F.N->GetRuntime()->Start(GraphAlpha(), [&](const FMRDialogueResult& X) { Res = X; bDone = true; });
	F.N->GetRuntime()->Continue();
	TestTrue(TEXT("imported dialogue text resolves through the registered string table"), F.N->GetRuntime()->GetView().Text.ToString() == TEXT("TEST FIXTURE - NONCANON: alpha question (placeholder).") && F.N->GetRuntime()->GetView().Choices.Num() == 2);
	F.N->GetRuntime()->Choose(FName("c_yes")); F.N->GetRuntime()->Continue();
	TestTrue(TEXT("imported graph completes with its event and accepts the mission"), bDone && Res.CompletionEventId == EvtAccept() && F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active);
	FMRNarrativeStore::Delete(); Clean(C);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRImp_Unmodified, "MoonRacer.NarrativeImport.Import.SourceFilesAreNeverModified", TestFlags)
bool FMRImp_Unmodified::RunTest(const FString&)
{
	const FString C = TEXT("Unmodified"); Clean(C);
	const FString Dir = Copy(C);
	TMap<FString, FString> H; TMap<FString, FDateTime> T;
	for (const FString& F : Files()) { H.Add(F, HashFile(Dir / F)); T.Add(F, IFileManager::Get().GetTimeStamp(*(Dir / F))); }
	TArray<FString> Before; IFileManager::Get().FindFiles(Before, *(Dir / TEXT("*")), true, true);
	const FMRImportReport R = FMRNarrativeImporter::Import(Opts(Dir, C)); TestTrue(TEXT("imported"), R.Outcome == EMRImportOutcome::Imported);
	FMRNarrativeImporter::Import(Opts(Dir, C, false)); FMRNarrativeImporter::Import(Opts(Dir, C));
	for (const FString& F : Files()) { TestTrue(TEXT("content unchanged: ") + F, HashFile(Dir / F) == H[F]); TestTrue(TEXT("timestamp unchanged: ") + F, IFileManager::Get().GetTimeStamp(*(Dir / F)) == T[F]); }
	TArray<FString> After; IFileManager::Get().FindFiles(After, *(Dir / TEXT("*")), true, true);
	TestEqual(TEXT("no files added to the source directory"), After.Num(), Before.Num());
	// the repository source itself
	TestTrue(TEXT("repository fixture manifest hashes are current"), FMRNarrativeImporter::Import(Opts(FixtureSrc(), C, false)).Validation.NumErrors() == 0);
	Clean(C); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRImp_Schema, "MoonRacer.NarrativeImport.Validation.InvalidSchemaIsRejected", TestFlags)
bool FMRImp_Schema::RunTest(const FString&)
{
	struct FCase { const TCHAR* Name; const TCHAR* Code; TFunction<void(const FString&)> Mut; };
	const TArray<FCase> Cases = {
		{ TEXT("MalformedJson"),   TEXT("JSON_PARSE"),            [](const FString& D) { Replace(D, TEXT("npcs.json"), TEXT("\"kind\": \"npcs\""), TEXT("\"kind\": \"npcs\",,")); } },
		{ TEXT("WrongType"),       TEXT("SCHEMA_TYPE"),           [](const FString& D) { Replace(D, TEXT("npcs.json"), TEXT("\"testFixture\": true"), TEXT("\"testFixture\": \"yes\"")); } },
		{ TEXT("UnknownField"),    TEXT("SCHEMA_UNKNOWN_FIELD"),  [](const FString& D) { Replace(D, TEXT("npcs.json"), TEXT("\"stringTable\":"), TEXT("\"bogus\": 1, \"stringTable\":")); } },
		{ TEXT("MissingField"),    TEXT("SCHEMA_MISSING_FIELD"),  [](const FString& D) { Replace(D, TEXT("npcs.json"), TEXT("\"displayNameKey\": \"npc_alpha_name\","), TEXT("")); } },
		{ TEXT("BadEnum"),         TEXT("SCHEMA_ENUM"),           [](const FString& D) { Replace(D, TEXT("dialogues.json"), TEXT("\"type\": \"branch\""), TEXT("\"type\": \"teleport\"")); } },
		{ TEXT("BadKind"),         TEXT("SCHEMA_ENUM"),           [](const FString& D) { Replace(D, TEXT("strings.json"), TEXT("\"kind\": \"strings\""), TEXT("\"kind\": \"lore\"")); } },
		{ TEXT("BadClassification"), TEXT("SCHEMA_ENUM"),         [](const FString& D) { Replace(D, TEXT("bundle.json"), TEXT("\"TEST_FIXTURE\""), TEXT("\"MAYBE\"")); } },
		{ TEXT("SchemaVersion"),   TEXT("SCHEMA_VERSION"),        [](const FString& D) { Replace(D, TEXT("strings.json"), TEXT("\"schemaVersion\": 1"), TEXT("\"schemaVersion\": 2")); } },
		{ TEXT("InvalidId"),       TEXT("INVALID_ID"),            [](const FString& D) { Replace(D, TEXT("npcs.json"), TEXT("\"id\": \"TEST_FIXTURE_NPC_BETA\""), TEXT("\"id\": \"TEST FIXTURE BETA!\"")); } },
		{ TEXT("HashMismatch"),    TEXT("HASH_MISMATCH"),         [](const FString& D) { Replace(D, TEXT("strings.json"), TEXT("alpha line one"), TEXT("alpha line ONE"), false); } },
		{ TEXT("UnlistedFile"),    TEXT("UNLISTED_FILE"),         [](const FString& D) { FFileHelper::SaveStringToFile(TEXT("{}"), *(D / TEXT("extra.json"))); } },
		{ TEXT("MissingFile"),     TEXT("SOURCE_UNREADABLE"),     [](const FString& D) { IFileManager::Get().Delete(*(D / TEXT("missions.json"))); } },
		{ TEXT("MissingManifest"), TEXT("SOURCE_UNREADABLE"),     [](const FString& D) { IFileManager::Get().Delete(*(D / TEXT("bundle.json"))); } },
		{ TEXT("PathEscape"),      TEXT("BAD_PATH"),              [](const FString& D) { Replace(D, TEXT("bundle.json"), TEXT("\"missions.json\""), TEXT("\"../missions.json\""), false); } },
	};
	for (const FCase& K : Cases)
	{
		const FString C = FString(TEXT("Schema_")) + K.Name; const FString D = Copy(C); K.Mut(D);
		const FMRImportReport R = FMRNarrativeImporter::Import(Opts(D, C));
		const FString L = FString(K.Name) + TEXT(" expects ") + K.Code;
		TestTrue(L + TEXT(" rejected"), R.Outcome == EMRImportOutcome::Rejected);
		TestTrue(L + TEXT(" code reported"), R.Validation.HasCode(K.Code));
		bool bActionable = true; for (const FMRDiagnostic& X : R.Validation.Items) if (X.bError && (X.Message.Len() < 10 || X.RecordId.IsNone())) bActionable = false;
		TestTrue(L + TEXT(" diagnostics actionable"), bActionable);
		TestTrue(L + TEXT(" nothing written (no partial import)"), NothingWritten(C) && R.GeneratedAssets.Num() == 0);
		Clean(C);
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRImp_Semantic, "MoonRacer.NarrativeImport.Validation.SemanticErrorsAreRejected", TestFlags)
bool FMRImp_Semantic::RunTest(const FString&)
{
	struct FCase { const TCHAR* Name; const TCHAR* Code; TFunction<void(const FString&)> Mut; };
	const TArray<FCase> Cases = {
		{ TEXT("MissingNpc"),        TEXT("UNKNOWN_NPC"),        [](const FString& D) { Replace(D, TEXT("dialogues.json"), TEXT("\"npcId\": \"TEST_FIXTURE_NPC_BETA\""), TEXT("\"npcId\": \"TEST_FIXTURE_NPC_NOPE\"")); } },
		{ TEXT("MissingNode"),       TEXT("DANGLING_EDGE"),      [](const FString& D) { Replace(D, TEXT("dialogues.json"), TEXT("\"next\": \"n_end_no\""), TEXT("\"next\": \"n_ghost\"")); } },
		{ TEXT("BadMissionRef"),     TEXT("UNKNOWN_MISSION"),    [](const FString& D) { Replace(D, TEXT("dialogues.json"), TEXT("\"subject\": \"TEST_FIXTURE_MISSION\""), TEXT("\"subject\": \"TEST_FIXTURE_MISSION_X\"")); } },
		{ TEXT("BadOfferingNpc"),    TEXT("UNKNOWN_NPC"),        [](const FString& D) { Replace(D, TEXT("missions.json"), TEXT("\"offeringNpcId\": \"TEST_FIXTURE_NPC_ALPHA\""), TEXT("\"offeringNpcId\": \"TEST_FIXTURE_NPC_NOPE\"")); } },
		{ TEXT("MissingLocKey"),     TEXT("MISSING_STRING_KEY"), [](const FString& D) { Replace(D, TEXT("strings.json"), TEXT("\"alpha_ask\": \"TEST FIXTURE - NONCANON: alpha question (placeholder).\","), TEXT("")); } },
		{ TEXT("MissingLocTable"),   TEXT("MISSING_STRING_KEY"), [](const FString& D) { Replace(D, TEXT("missions.json"), TEXT("\"stringTable\": \"TEST_FIXTURE_NONCANON_STRINGS\""), TEXT("\"stringTable\": \"NO_SUCH_TABLE\"")); } },
		{ TEXT("DuplicateIds"),      TEXT("DUPLICATE_ID"),       [](const FString& D) { Replace(D, TEXT("npcs.json"), TEXT("\"id\": \"TEST_FIXTURE_NPC_BETA\""), TEXT("\"id\": \"TEST_FIXTURE_NPC_ALPHA\"")); } },
		{ TEXT("DuplicateEffectId"), TEXT("DUPLICATE_EFFECT_ID"),[](const FString& D) { Replace(D, TEXT("dialogues.json"), TEXT("\"effectId\": \"TEST_FIXTURE_FX_OFFER\""), TEXT("\"effectId\": \"TEST_FIXTURE_FX_MET\"")); } },
		{ TEXT("VersionConflict"),   TEXT("VERSION_CONFLICT"),   [](const FString& D) { Replace(D, TEXT("npcs.json"), TEXT("\"displayNameKey\": \"npc_beta_name\","), TEXT("\"displayNameKey\": \"npc_beta_name\", \"contentVersion\": \"TEST_FIXTURE_V9\",")); } },
		{ TEXT("UnreachableNode"),   TEXT("UNREACHABLE_NODE"),   [](const FString& D) { EditJ(D, TEXT("dialogues.json"), [](const FJ& O) { const FJ Orphan = MakeShared<FJsonObject>(); Orphan->SetStringField(TEXT("id"), TEXT("n_orphan")); Orphan->SetStringField(TEXT("type"), TEXT("end")); MutArr(O->GetArrayField(TEXT("records"))[1]->AsObject(), TEXT("nodes"), [&](TArray<TSharedPtr<FJsonValue>>& A) { A.Add(MakeShared<FJsonValueObject>(Orphan)); }); }); } },
		{ TEXT("FixtureInProductionBundle"), TEXT("CLASSIFICATION_MISMATCH"), [](const FString& D) { Replace(D, TEXT("bundle.json"), TEXT("\"TEST_FIXTURE\""), TEXT("\"PRODUCTION\"")); } },
		{ TEXT("ProductionNoApproval"), TEXT("MISSING_APPROVAL"), [](const FString& D) { Replace(D, TEXT("bundle.json"), TEXT("\"TEST_FIXTURE\""), TEXT("\"PRODUCTION\"")); } },
		{ TEXT("FixtureTextInProduction"), TEXT("PRODUCTION_FIXTURE_TEXT"), [](const FString& D) { Replace(D, TEXT("bundle.json"), TEXT("\"TEST_FIXTURE\""), TEXT("\"PRODUCTION\"")); } },
		{ TEXT("FixtureFlagMissing"), TEXT("CLASSIFICATION_MISMATCH"), [](const FString& D) { Replace(D, TEXT("npcs.json"), TEXT("\"testFixture\": true"), TEXT("\"testFixture\": false")); } },
		{ TEXT("MissingProvenance"), TEXT("MISSING_PROVENANCE"), [](const FString& D) {
			// a production-labelled bundle whose records are not fixtures and carry no provenance
			Replace(D, TEXT("bundle.json"), TEXT("\"TEST_FIXTURE\""), TEXT("\"PRODUCTION\""));
			for (const TCHAR* F : { TEXT("npcs.json"), TEXT("dialogues.json"), TEXT("missions.json") }) EditJ(D, F, [](const FJ& O) { for (const TSharedPtr<FJsonValue>& V : O->GetArrayField(TEXT("records"))) { V->AsObject()->SetBoolField(TEXT("testFixture"), false); V->AsObject()->RemoveField(TEXT("provenance")); } }); } },
		{ TEXT("IncompleteApproval"), TEXT("SCHEMA_MISSING_FIELD"), [](const FString& D) { Replace(D, TEXT("bundle.json"), TEXT("\"TEST_FIXTURE\","), TEXT("\"PRODUCTION\", \"approval\": { \"approvalId\": \"A\" },")); } },
	};
	for (const FCase& K : Cases)
	{
		const FString C = FString(TEXT("Sem_")) + K.Name; const FString D = Copy(C); K.Mut(D);
		const FMRImportReport R = FMRNarrativeImporter::Import(Opts(D, C));
		const FString L = FString(K.Name) + TEXT(" expects ") + K.Code;
		TestTrue(L + TEXT(" rejected"), R.Outcome == EMRImportOutcome::Rejected);
		TestTrue(L + TEXT(" code reported"), R.Validation.HasCode(K.Code));
		TestTrue(L + TEXT(" nothing written"), NothingWritten(C));
		Clean(C);
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRImp_Production, "MoonRacer.NarrativeImport.Isolation.FixturesNeverEnterProduction", TestFlags)
bool FMRImp_Production::RunTest(const FString&)
{
	const FString C = TEXT("Prod"); Clean(C);
	FMRImportOptions O = Opts(FixtureSrc(), C); O.bForceProductionPolicy = true;
	const FMRImportReport R = FMRNarrativeImporter::Import(O);
	TestTrue(TEXT("a fixture bundle fails production validation"), R.Outcome == EMRImportOutcome::Rejected && R.Validation.HasCode(TEXT("FIXTURE_NOT_ALLOWED")) && R.Validation.HasCode(TEXT("PRODUCTION_FIXTURE_TEXT")));
	TestTrue(TEXT("and wrote nothing"), NothingWritten(C));

	// a well-formed, approved, SYNTHETIC production-style bundle (validator-only; ids/text are obviously synthetic, never committed)
	const FString D = WorkDir(C) / TEXT("synthetic");
	const FString Tbl = TEXT("SYNTHETIC_VALIDATOR_ONLY_STRINGS");
	auto Write = [&](const FString& N, const FString& Json) { FFileHelper::SaveStringToFile(Json, *(D / N)); };
	Write(TEXT("strings.json"), FString::Printf(TEXT("{\"schemaVersion\":1,\"kind\":\"strings\",\"tableId\":\"%s\",\"entries\":{\"n\":\"synthetic validator text\",\"t\":\"synthetic validator text\",\"o\":\"synthetic validator text\"}}"), *Tbl));
	const FString Prov = TEXT("\"provenance\":{\"sourceDocumentId\":\"SYNTHETIC_SOURCE\",\"approvalId\":\"SYNTHETIC_APPROVAL\"}");
	Write(TEXT("npcs.json"), FString::Printf(TEXT("{\"schemaVersion\":1,\"kind\":\"npcs\",\"records\":[{\"id\":\"SYNTHETIC_NPC\",\"stringTable\":\"%s\",\"displayNameKey\":\"n\",\"defaultDialogueId\":\"SYNTHETIC_DLG\",%s}]}"), *Tbl, *Prov));
	Write(TEXT("dialogues.json"), FString::Printf(TEXT("{\"schemaVersion\":1,\"kind\":\"dialogues\",\"records\":[{\"id\":\"SYNTHETIC_DLG\",\"npcId\":\"SYNTHETIC_NPC\",\"stringTable\":\"%s\",\"start\":\"a\",%s,\"nodes\":[{\"id\":\"a\",\"type\":\"line\",\"speaker\":\"SYNTHETIC_NPC\",\"textKey\":\"t\",\"next\":\"b\"},{\"id\":\"b\",\"type\":\"end\"}]}]}"), *Tbl, *Prov));
	Write(TEXT("missions.json"), FString::Printf(TEXT("{\"schemaVersion\":1,\"kind\":\"missions\",\"records\":[{\"id\":\"SYNTHETIC_MSN\",\"stringTable\":\"%s\",\"titleKey\":\"t\",%s,\"objectives\":[{\"id\":\"SYNTHETIC_OBJ\",\"textKey\":\"o\",\"completionEvent\":\"SYNTHETIC_EVT\"}]}]}"), *Tbl, *Prov));
	Write(TEXT("bundle.json"), TEXT("{\"schemaVersion\":1,\"bundleId\":\"SYNTHETIC_VALIDATOR_BUNDLE\",\"classification\":\"PRODUCTION\",\"dialogueVersion\":\"SYNTHETIC_V1\",\"questVersion\":\"SYNTHETIC_V1\",\"approval\":{\"approvalId\":\"SYNTHETIC_APPROVAL\",\"approvedBy\":\"synthetic\",\"approvedOn\":\"2000-01-01\",\"sourceDocumentId\":\"SYNTHETIC_SOURCE\"},\"files\":[{\"path\":\"strings.json\",\"sha1\":\"\"},{\"path\":\"npcs.json\",\"sha1\":\"\"},{\"path\":\"dialogues.json\",\"sha1\":\"\"},{\"path\":\"missions.json\",\"sha1\":\"\"}]}"));
	Rehash(D);
	const FMRImportReport P = FMRNarrativeImporter::Import(Opts(D, C, /*commit*/ false));
	TestTrue(TEXT("the production path accepts well-formed approved records (validate-only)"), P.Outcome == EMRImportOutcome::ValidatedOnly && P.Validation.NumErrors() == 0);
	TestTrue(TEXT("validate-only writes nothing"), NothingWritten(C));

	// nothing is published automatically
	const FMRImportReport I = FMRNarrativeImporter::Import(Opts(FixtureSrc(), C));
	TestTrue(TEXT("fixture import ok"), I.Outcome == EMRImportOutcome::Imported);
	FMRNarrativeBundle B; FMRValidationReport V;
	TestFalse(TEXT("production-only loading refuses an active fixture bundle"), FMRNarrativeImporter::LoadActive(OutRoot(C), BundleId, B, V, /*production only*/ true));
	TestTrue(TEXT("with FIXTURE_NOT_ALLOWED"), V.HasCode(TEXT("FIXTURE_NOT_ALLOWED")));
	FNar F; TestFalse(TEXT("importing never registers content with the narrative subsystem"), F.N->HasBundle());
	const FString Flow = FPaths::ConvertRelativePathToFull(FPaths::ProjectContentDir() / TEXT("MoonRacer/Onboarding/DA_MR_OnboardingFlow.uasset"));
	const FString FlowHash = HashFile(Flow);
	FMRNarrativeImporter::Import(Opts(FixtureSrc(), C));
	TestTrue(TEXT("the production onboarding flow asset is untouched"), !FlowHash.IsEmpty() && HashFile(Flow) == FlowHash);
	TestTrue(TEXT("tests use a dedicated narrative slot"), !FMRNarrativeStore::IsDefaultSlot());
	Clean(C); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRImp_Interrupted, "MoonRacer.NarrativeImport.Import.InterruptedImportKeepsPreviousBundle", TestFlags)
bool FMRImp_Interrupted::RunTest(const FString&)
{
	const FString C = TEXT("Interrupted"); const FString D = Copy(C);
	// a) interrupted FIRST import: nothing becomes active
	{ FScopedFail Fail(2); const FMRImportReport R = FMRNarrativeImporter::Import(Opts(D, C)); TestTrue(TEXT("first import interrupted"), R.Outcome == EMRImportOutcome::Failed && R.Validation.HasCode(TEXT("IMPORT_INTERRUPTED"))); TestEqual(TEXT("two assets reached disk"), R.GeneratedAssets.Num(), 2); }
	TestFalse(TEXT("no active bundle after an interrupted first import"), FMRNarrativeImporter::ReadActive(OutRoot(C), BundleId).bValid);
	{ FMRNarrativeBundle B; FMRValidationReport V; TestFalse(TEXT("an interrupted import cannot be loaded"), FMRNarrativeImporter::LoadActive(OutRoot(C), BundleId, B, V, false)); }
	const FMRImportReport Retry = FMRNarrativeImporter::Import(Opts(D, C));
	TestTrue(TEXT("retry completes (the incomplete folder is rebuilt)"), Retry.Outcome == EMRImportOutcome::Imported && Retry.GeneratedAssets.Num() == 6);
	const FString V1Hash = FMRNarrativeImporter::ReadActive(OutRoot(C), BundleId).BundleHash;

	// b) interrupted UPDATE: the previous bundle stays active and loadable
	const FString D2 = WorkDir(C) / TEXT("src2"); for (const FString& F : Files()) IFileManager::Get().Copy(*(D2 / F), *(D / F));
	Replace(D2, TEXT("bundle.json"), TEXT("TEST_FIXTURE_V1"), TEXT("TEST_FIXTURE_V2"), false);
	Replace(D2, TEXT("strings.json"), TEXT("alpha line one"), TEXT("alpha line UPDATED"));
	{ FScopedFail Fail(3); const FMRImportReport R = FMRNarrativeImporter::Import(Opts(D2, C)); TestTrue(TEXT("update interrupted"), R.Outcome == EMRImportOutcome::Failed); }
	const FMRActiveReceipt Rc = FMRNarrativeImporter::ReadActive(OutRoot(C), BundleId);
	TestTrue(TEXT("previous bundle still active"), Rc.bValid && Rc.BundleHash == V1Hash && Rc.DialogueVersion == TEXT("TEST_FIXTURE_V1"));
	{ FMRNarrativeBundle B; FMRValidationReport V; TestTrue(TEXT("previous bundle still loads"), FMRNarrativeImporter::LoadActive(OutRoot(C), BundleId, B, V, false)); TestTrue(TEXT("and carries the OLD text"), MRNarrative::ResolveText(TableId(), FName("alpha_1")).ToString().Contains(TEXT("alpha line one"))); }
	const FMRImportReport Fin = FMRNarrativeImporter::Import(Opts(D2, C));
	TestTrue(TEXT("retry of the update succeeds"), Fin.Outcome == EMRImportOutcome::Imported);
	{ FMRNarrativeBundle B; FMRValidationReport V; FMRNarrativeImporter::LoadActive(OutRoot(C), BundleId, B, V, false); TestTrue(TEXT("new text is active"), MRNarrative::ResolveText(TableId(), FName("alpha_1")).ToString().Contains(TEXT("UPDATED"))); }
	Clean(C); RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRImp_Repeat, "MoonRacer.NarrativeImport.Import.RepeatImportsDoNotDuplicate", TestFlags)
bool FMRImp_Repeat::RunTest(const FString&)
{
	const FString C = TEXT("Repeat"); const FString D = Copy(C);
	const FMRImportReport A = FMRNarrativeImporter::Import(Opts(D, C)); TestTrue(TEXT("first import"), A.Outcome == EMRImportOutcome::Imported);
	const FString Dir = FMRNarrativeImporter::BundleDir(OutRoot(C), BundleId);
	TArray<FString> F1; IFileManager::Get().FindFilesRecursive(F1, *Dir, TEXT("*"), true, false);
	TMap<FString, FDateTime> Stamps; for (const FString& P : F1) Stamps.Add(P, IFileManager::Get().GetTimeStamp(*P));
	const FMRImportReport B = FMRNarrativeImporter::Import(Opts(D, C));
	TestTrue(TEXT("second import of identical source is Unchanged"), B.Outcome == EMRImportOutcome::Unchanged && B.GeneratedAssets.Num() == 0 && B.BundleHash == A.BundleHash);
	TArray<FString> F2; IFileManager::Get().FindFilesRecursive(F2, *Dir, TEXT("*"), true, false);
	TestEqual(TEXT("no files added"), F2.Num(), F1.Num());
	bool bSame = true; for (const FString& P : F1) bSame &= IFileManager::Get().GetTimeStamp(*P) == Stamps[P]; TestTrue(TEXT("no file rewritten"), bSame);
	{ FMRNarrativeBundle X; FMRValidationReport V; FMRNarrativeImporter::LoadActive(OutRoot(C), BundleId, X, V, false); TestTrue(TEXT("exactly one record per id after repeat imports"), X.Npcs.Num() == 2 && X.Graphs.Num() == 2 && X.Missions.Num() == 1); }
	// whitespace/key-order only changes are the same content
	{ FJ M = LoadJ(D / TEXT("npcs.json")); SaveJ(D / TEXT("npcs.json"), M); Rehash(D); const FMRImportReport W = FMRNarrativeImporter::Import(Opts(D, C)); TestTrue(TEXT("re-serialised (reformatted) source is still Unchanged"), W.Outcome == EMRImportOutcome::Unchanged); }

	// content change WITHOUT a version bump is a conflict
	const FString D2 = WorkDir(C) / TEXT("src2"); for (const FString& F : Files()) IFileManager::Get().Copy(*(D2 / F), *(D / F));
	Replace(D2, TEXT("strings.json"), TEXT("alpha line one"), TEXT("alpha line CHANGED"));
	const FMRImportReport Conf = FMRNarrativeImporter::Import(Opts(D2, C));
	TestTrue(TEXT("same version + different content is rejected"), Conf.Outcome == EMRImportOutcome::Rejected && Conf.Validation.HasCode(TEXT("VERSION_CONFLICT")));
	TestTrue(TEXT("the active bundle is untouched"), FMRNarrativeImporter::ReadActive(OutRoot(C), BundleId).BundleHash == A.BundleHash);

	// with a version bump it imports, reports impact, and keeps the old folder
	Replace(D2, TEXT("bundle.json"), TEXT("TEST_FIXTURE_V1"), TEXT("TEST_FIXTURE_V2"), false);
	EditJ(D2, TEXT("dialogues.json"), [](const FJ& O) { O->GetArrayField(TEXT("records"))[0]->AsObject()->GetArrayField(TEXT("nodes"))[0]->AsObject()->GetArrayField(TEXT("onEnter"))[0]->AsObject()->SetStringField(TEXT("effectId"), TEXT("TEST_FIXTURE_FX_MET_RENAMED")); });
	const FMRImportReport Up = FMRNarrativeImporter::Import(Opts(D2, C));
	TestTrue(TEXT("version bump imports"), Up.Outcome == EMRImportOutcome::Imported);
	FString Impact; for (const FString& I : Up.Impact) Impact += I + TEXT("\n");
	TestTrue(TEXT("impact report: versions, changed records, renamed one-time effect"), Impact.Contains(TEXT("dialogue version TEST_FIXTURE_V1 -> TEST_FIXTURE_V2")) && Impact.Contains(TEXT("CHANGED strings:")) && Impact.Contains(TEXT("CHANGED dialogue:TEST_FIXTURE_DIALOGUE_ALPHA")) && Impact.Contains(TEXT("TEST_FIXTURE_FX_MET")) && Impact.Contains(TEXT("KEPT")));
	TArray<FString> Dirs; IFileManager::Get().FindFiles(Dirs, *(Dir / TEXT("*")), false, true);
	TestEqual(TEXT("both content-addressed folders exist (no deletion)"), Dirs.Num(), 2);
	// rollback to v1 source re-activates the existing folder without rewriting assets
	const FMRImportReport Back = FMRNarrativeImporter::Import(Opts(D, C));
	TestTrue(TEXT("re-importing the earlier source re-activates it without rewriting"), Back.Outcome == EMRImportOutcome::Imported && Back.GeneratedAssets.Num() == 0 && FMRNarrativeImporter::ReadActive(OutRoot(C), BundleId).BundleHash == A.BundleHash);
	// removals are reported
	const FString D3 = WorkDir(C) / TEXT("src3"); for (const FString& F : Files()) IFileManager::Get().Copy(*(D3 / F), *(D / F));
	Replace(D3, TEXT("bundle.json"), TEXT("TEST_FIXTURE_V1"), TEXT("TEST_FIXTURE_V3"), false);
	EditJ(D3, TEXT("npcs.json"), [](const FJ& O) { MutArr(O, TEXT("records"), [](TArray<TSharedPtr<FJsonValue>>& A) { A.RemoveAt(1); }); });
	EditJ(D3, TEXT("dialogues.json"), [](const FJ& O) { MutArr(O, TEXT("records"), [](TArray<TSharedPtr<FJsonValue>>& A) { A.RemoveAt(1); }); });
	const FMRImportReport Rm = FMRNarrativeImporter::Import(Opts(D3, C));
	FString RI; for (const FString& I : Rm.Impact) RI += I + TEXT("\n");
	TestTrue(TEXT("removed NPC and dialogue are reported"), Rm.Outcome == EMRImportOutcome::Imported && RI.Contains(TEXT("REMOVED npc:TEST_FIXTURE_NPC_BETA")) && RI.Contains(TEXT("REMOVED dialogue:TEST_FIXTURE_DIALOGUE_BETA")));
	Clean(C); RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRImp_Saves, "MoonRacer.NarrativeImport.Compatibility.ChangedContentNeverResetsSaves", TestFlags)
bool FMRImp_Saves::RunTest(const FString&)
{
	const FString C = TEXT("Saves"); const FString D = Copy(C);
	FMRNarrativeStore::SetSlotBaseOverride(TEXT("MRNarrative_ImportTest")); FMRNarrativeStore::Delete();
	auto Publish = [&](const FString& Dir, FNar& F)
	{
		const FMRImportReport R = FMRNarrativeImporter::Import(Opts(Dir, C)); check(R.Ok());
		FMRNarrativeBundle B; FMRValidationReport V; FMRNarrativeImporter::LoadActive(OutRoot(C), BundleId, B, V, false);
		FMRValidationReport Reg; F.N->RegisterBundle(B, FMRValidationPolicy(), Reg); return Reg.NumErrors() == 0;
	};
	FMRNarrativeState Before;
	{ FNar F; TestTrue(TEXT("v1 published (explicitly)"), Publish(D, F)); F.N->LoadState();
	  F.N->GetRuntime()->Start(GraphAlpha()); F.N->GetRuntime()->Continue(); F.N->GetRuntime()->Choose(FName("c_yes")); F.N->GetRuntime()->Continue(); F.N->NotifyGameEvent(EvtObj1());
	  Before = F.N->GetState(); TestTrue(TEXT("player has progress"), F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active && F.N->IsObjectiveCompleted(Obj1())); }

	// v2: changed content + bumped versions
	const FString D2 = WorkDir(C) / TEXT("src2"); for (const FString& F : Files()) IFileManager::Get().Copy(*(D2 / F), *(D / F));
	Replace(D2, TEXT("bundle.json"), TEXT("TEST_FIXTURE_V1"), TEXT("TEST_FIXTURE_V2"), false);
	Replace(D2, TEXT("strings.json"), TEXT("objective one"), TEXT("objective ONE (revised)"));
	{ FNar F; TestTrue(TEXT("v2 published"), Publish(D2, F)); const FMRNarrativeLoadInfo L = F.N->LoadState();
	  TestTrue(TEXT("version mismatch detected"), L.Store.bValid && L.bVersionMismatch);
	  TestTrue(TEXT("progress NOT reset: state identical"), F.N->GetState() == Before);
	  TestTrue(TEXT("mission still active, objective 1 done, objective 2 current"), F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active && F.N->GetTrackedObjective().ObjectiveId == Obj2());
	  const FMRNarrativeLoadInfo L2 = F.N->LoadState(); TestFalse(TEXT("after the re-stamp there is no further mismatch"), L2.bVersionMismatch); }

	// v3: the mission and everything referencing it removed
	const FString D3 = WorkDir(C) / TEXT("src3"); for (const FString& F : Files()) IFileManager::Get().Copy(*(D3 / F), *(D2 / F));
	Replace(D3, TEXT("bundle.json"), TEXT("TEST_FIXTURE_V2"), TEXT("TEST_FIXTURE_V3"), false);
	EditJ(D3, TEXT("missions.json"), [](const FJ& O) { MutArr(O, TEXT("records"), [](TArray<TSharedPtr<FJsonValue>>& A) { A.Empty(); }); });
	EditJ(D3, TEXT("dialogues.json"), [](const FJ& O)
	{
		auto Strip = [](const FJ& Owner, const TCHAR* Field)
		{
			if (!Owner->HasField(Field)) return;
			MutArr(Owner, Field, [](TArray<TSharedPtr<FJsonValue>>& Fx) { Fx.RemoveAll([](const TSharedPtr<FJsonValue>& E) { const FString T = E->AsObject()->GetStringField(TEXT("type")); return T == TEXT("offer_mission") || T == TEXT("accept_mission"); }); });
		};
		for (const TSharedPtr<FJsonValue>& G : O->GetArrayField(TEXT("records"))) for (const TSharedPtr<FJsonValue>& N : G->AsObject()->GetArrayField(TEXT("nodes")))
		{
			const FJ NO = N->AsObject(); Strip(NO, TEXT("onEnter"));
			if (NO->HasField(TEXT("choices"))) for (const TSharedPtr<FJsonValue>& Ch : NO->GetArrayField(TEXT("choices"))) Strip(Ch->AsObject(), TEXT("effects"));
		}
	});
	EditJ(D3, TEXT("npcs.json"), [](const FJ&) {});
	{ FNar F; const bool bPub = Publish(D3, F); TestTrue(TEXT("v3 published"), bPub); const FMRNarrativeLoadInfo L = F.N->LoadState();
	  TestTrue(TEXT("the removed mission is reported, not applied, not deleted"), L.UnknownMissions.Contains(Mission()) && F.N->FindMission(Mission()) == nullptr && F.N->GetState().Missions.Contains(Mission()));
	  TestTrue(TEXT("facts, completed dialogues and one-time ledger survive"), SameSet(F.N->GetState().Facts, Before.Facts) && SameSet(F.N->GetState().CompletedDialogues, Before.CompletedDialogues) && SameSet(F.N->GetState().FiredEffects, Before.FiredEffects)); }
	FMRNarrativeStore::Delete(); Clean(C); RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRImp_Disk, "MoonRacer.NarrativeImport.GeneratedDev.LoadsFromDisk", TestFlags)
bool FMRImp_Disk::RunTest(const FString&)
{
	// Meaningful in a FRESH process after the commandlet generated the development assets (so the load really reads the .uasset files).
	if (!FMRNarrativeImporter::ReadActive(TEXT("/Game/MoonRacer/Narrative/Generated"), BundleId).bValid) { AddWarning(TEXT("generated development bundle not present; run the MRNarrativeImport commandlet first")); return true; }
	FMRNarrativeBundle B; FMRValidationReport V;
	TestTrue(TEXT("generated development bundle loads and validates"), FMRNarrativeImporter::LoadActive(TEXT("/Game/MoonRacer/Narrative/Generated"), BundleId, B, V, false));
	TestTrue(TEXT("expected record counts"), B.Npcs.Num() == 2 && B.Graphs.Num() == 2 && B.Missions.Num() == 1);
	TestTrue(TEXT("all generated records are flagged fixtures"), B.Npcs[0]->bTestFixture && B.Graphs[0]->bTestFixture && B.Missions[0]->bTestFixture);
	FNar F; FMRValidationReport R; TestTrue(TEXT("registers on explicit request"), F.N->RegisterBundle(B, FMRValidationPolicy(), R));
	// the registration layer over the real on-disk development assets (fresh process => genuine .uasset loads); in-memory only, dedicated slot
	FNar G; FMRNarrativeStore::Delete();
	FMRRegistrationRequest Q; Q.Environment = EMREnvironment::Development; Q.BundleId = BundleId; Q.OutputRoot = TEXT("/Game/MoonRacer/Narrative/Generated");
	const FMRRegistrationResult RR = FMRNarrativeRegistrar::Register(G.N.Get(), Q);
	TestTrue(TEXT("the registrar verifies and registers the on-disk development bundle"), RR.bOk && G.N->HasBundle() && G.N->GetRegistration().Classification == TEXT("TEST_FIXTURE"));
	FMRNarrativeStore::Delete();
	return true;
}

} // namespace MRNarrativeImportTestUnit

#endif // WITH_DEV_AUTOMATION_TESTS
