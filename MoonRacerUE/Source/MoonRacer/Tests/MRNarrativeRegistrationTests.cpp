// Moon Racer - P5B-1 registration layer + importer hardening tests. Run:
//   UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer.NarrativeRegistration; Quit" -unattended -nullrhi -nosplash -nosound
// Content: NarrativeSource/TEST_FIXTURE_BUNDLE (TEST FIXTURE - NONCANON) and, for the PRODUCTION-RULE paths only, tiny SYNTHETIC validator-only bundles
// written into Saved/ working copies and temporary /Game/MoonRacer/Narrative/_RegTest assets (removed by the tests; never canon, never the real Generated folder).
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Dev/MRNarrativeFixtures.h"
#include "Dom/JsonObject.h"
#include "Engine/GameInstance.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "Narrative/Registration/MRNarrativeRegistrar.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "UObject/StrongObjectPtr.h"

namespace
{
	constexpr EAutomationTestFlags TestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;
	using namespace MRNarrativeFixtures;
	using FJ = TSharedPtr<FJsonObject>;
	using FArr = TArray<TSharedPtr<FJsonValue>>;
	const TCHAR* BundleId = TEXT("TEST_FIXTURE_BUNDLE");
	const TCHAR* SynthId = TEXT("SYNTHETIC_VALIDATOR_BUNDLE");
	const TArray<FString>& Files() { static const TArray<FString> F = { TEXT("bundle.json"), TEXT("strings.json"), TEXT("npcs.json"), TEXT("dialogues.json"), TEXT("missions.json") }; return F; }

	FString FixtureSrc() { return FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("NarrativeSource/TEST_FIXTURE_BUNDLE")); }
	FString WorkDir(const FString& C) { return FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir() / TEXT("NarrativeRegTest") / C); }
	FString Root(const FString& C) { return TEXT("/Game/MoonRacer/Narrative/_RegTest/") + C; }
	FString Disk(const FString& LongPath) { return FPaths::ConvertRelativePathToFull(FPackageName::LongPackageNameToFilename(LongPath, TEXT(""))); }
	void Clean(const FString& C)
	{
		IFileManager::Get().DeleteDirectory(*WorkDir(C), false, true);
		IFileManager::Get().DeleteDirectory(*Disk(Root(C)), false, true);
		IFileManager::Get().DeleteDirectory(*Disk(TEXT("/Game/MoonRacer/Narrative/_RegTest")), false, false);   // only if now empty
	}
	FJ LoadJ(const FString& P) { FString T; FFileHelper::LoadFileToString(T, *P); FJ O; FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(T), O); return O; }
	void SaveJ(const FString& P, const FJ& O) { FString T; FJsonSerializer::Serialize(O.ToSharedRef(), TJsonWriterFactory<>::Create(&T)); FFileHelper::SaveStringToFile(T, *P); }
	void MutArr(const FJ& O, const TCHAR* F, TFunction<void(FArr&)> Fn) { FArr A = O->GetArrayField(F); Fn(A); O->SetArrayField(F, A); }
	void Rehash(const FString& D)
	{
		FJ M = LoadJ(D / TEXT("bundle.json"));
		for (const TSharedPtr<FJsonValue>& V : M->GetArrayField(TEXT("files"))) { const FJ F = V->AsObject(); const FString H = FMRNarrativeImporter::Sha1OfFile(D / F->GetStringField(TEXT("path"))); if (!H.IsEmpty()) F->SetStringField(TEXT("sha1"), H); }
		SaveJ(D / TEXT("bundle.json"), M);
	}
	void Replace(const FString& D, const FString& File, const FString& Find, const FString& With, bool bRehash = true)
	{
		FString T; FFileHelper::LoadFileToString(T, *(D / File)); check(T.Contains(Find)); T = T.Replace(*Find, *With); FFileHelper::SaveStringToFile(T, *(D / File));
		if (bRehash && File != TEXT("bundle.json")) Rehash(D);
	}
	void EditJ(const FString& D, const FString& File, TFunction<void(const FJ&)> Fn) { FJ O = LoadJ(D / File); Fn(O); SaveJ(D / File, O); if (File != TEXT("bundle.json")) Rehash(D); }

	// a working copy of the fixture bundle at a given version, optionally with changed text
	FString Variant(const FString& C, const FString& Name, const FString& Version, const FString& NewAlphaText = FString())
	{
		const FString D = WorkDir(C) / Name;
		for (const FString& F : Files()) IFileManager::Get().Copy(*(D / F), *(FixtureSrc() / F));
		if (Version != TEXT("TEST_FIXTURE_V1")) Replace(D, TEXT("bundle.json"), TEXT("TEST_FIXTURE_V1"), Version, false);
		if (!NewAlphaText.IsEmpty()) Replace(D, TEXT("strings.json"), TEXT("alpha line one"), NewAlphaText);
		return D;
	}
	FMRImportReport Import(const FString& Dir, const FString& C, bool bCommit = true) { FMRImportOptions O; O.SourceDir = Dir; O.OutputRoot = Root(C); O.bCommit = bCommit; return FMRNarrativeImporter::Import(O); }
	FMRRegistrationRequest Req(const FString& C, EMREnvironment E = EMREnvironment::Development, const TCHAR* Id = nullptr) { FMRRegistrationRequest R; R.Environment = E; R.OutputRoot = Root(C); R.BundleId = Id ? Id : BundleId; return R; }
	FString AlphaText() { return MRNarrative::ResolveText(TableId(), FName("alpha_1")).ToString(); }

	struct FEnvGuard { explicit FEnvGuard(EMREnvironment E) { MRNarrative::SetEnvironmentOverrideForTest(E); } ~FEnvGuard() { MRNarrative::SetEnvironmentOverrideForTest(EMREnvironment::Unspecified); FMRNarrativeRegistrar::GFailAtStep = 0; } };

	struct FNar
	{
		TStrongObjectPtr<UGameInstance> GI; TStrongObjectPtr<UMRNarrativeSubsystem> N;
		explicit FNar(bool bFresh = true) { FMRNarrativeStore::SetSlotBaseOverride(TEXT("MRNarrative_RegTest")); if (bFresh) FMRNarrativeStore::Delete(); GI.Reset(NewObject<UGameInstance>(GetTransientPackage())); N.Reset(NewObject<UMRNarrativeSubsystem>(GI.Get())); N->Setup(); }
		FString RegHash() const { return N->GetRegistration().BundleHash; }
		void PlayAlphaYes() { UMRDialogueRuntime* R = N->GetRuntime(); R->Start(GraphAlpha()); R->Continue(); R->Choose(FName("c_yes")); R->Continue(); }
	};

	// ---- SYNTHETIC production-rule bundle (validator-only content: obviously synthetic ids/text) -----------------------
	FString WriteSynth(const FString& C, const FString& Name, const FString& Version, const FString& EffectId, bool bWithEffect = true, TFunction<void(const FString&)> Extra = nullptr)
	{
		const FString D = WorkDir(C) / Name; const FString Tbl = TEXT("SYNTHETIC_VALIDATOR_ONLY_STRINGS");
		auto W = [&](const FString& N, const FString& J) { FFileHelper::SaveStringToFile(J, *(D / N)); };
		const FString Prov = TEXT("\"provenance\":{\"sourceDocumentId\":\"SYNTHETIC_SOURCE\",\"approvalId\":\"SYNTHETIC_APPROVAL\"}");
		W(TEXT("strings.json"), FString::Printf(TEXT("{\"schemaVersion\":1,\"kind\":\"strings\",\"tableId\":\"%s\",\"entries\":{\"n\":\"synthetic validator text\",\"t\":\"synthetic validator text %s\",\"o\":\"synthetic validator text\"}}"), *Tbl, *Version));
		W(TEXT("npcs.json"), FString::Printf(TEXT("{\"schemaVersion\":1,\"kind\":\"npcs\",\"records\":[{\"id\":\"SYNTHETIC_NPC\",\"stringTable\":\"%s\",\"displayNameKey\":\"n\",\"defaultDialogueId\":\"SYNTHETIC_DLG\",%s}]}"), *Tbl, *Prov));
		const FString Fx = bWithEffect ? FString::Printf(TEXT(",\"onEnter\":[{\"type\":\"set_fact\",\"subject\":\"SYNTHETIC_FACT\",\"oneTime\":true,\"effectId\":\"%s\"}]"), *EffectId) : FString();
		W(TEXT("dialogues.json"), FString::Printf(TEXT("{\"schemaVersion\":1,\"kind\":\"dialogues\",\"records\":[{\"id\":\"SYNTHETIC_DLG\",\"npcId\":\"SYNTHETIC_NPC\",\"stringTable\":\"%s\",\"start\":\"a\",%s,\"nodes\":[{\"id\":\"a\",\"type\":\"line\",\"speaker\":\"SYNTHETIC_NPC\",\"textKey\":\"t\",\"next\":\"b\"%s},{\"id\":\"b\",\"type\":\"end\"}]}]}"), *Tbl, *Prov, *Fx));
		W(TEXT("missions.json"), FString::Printf(TEXT("{\"schemaVersion\":1,\"kind\":\"missions\",\"records\":[{\"id\":\"SYNTHETIC_MSN\",\"stringTable\":\"%s\",\"titleKey\":\"t\",%s,\"objectives\":[{\"id\":\"SYNTHETIC_OBJ\",\"textKey\":\"o\",\"completionEvent\":\"SYNTHETIC_EVT\"}]}]}"), *Tbl, *Prov));
		W(TEXT("bundle.json"), FString::Printf(TEXT("{\"schemaVersion\":1,\"bundleId\":\"%s\",\"classification\":\"PRODUCTION\",\"dialogueVersion\":\"%s\",\"questVersion\":\"%s\",\"approval\":{\"approvalId\":\"SYNTHETIC_APPROVAL\",\"approvedBy\":\"synthetic\",\"approvedOn\":\"2000-01-01\",\"sourceDocumentId\":\"SYNTHETIC_SOURCE\"},\"files\":[{\"path\":\"strings.json\",\"sha1\":\"\"},{\"path\":\"npcs.json\",\"sha1\":\"\"},{\"path\":\"dialogues.json\",\"sha1\":\"\"},{\"path\":\"missions.json\",\"sha1\":\"\"}]}"), SynthId, *Version, *Version));
		Rehash(D); if (Extra) Extra(D);
		return D;
	}
}

// ---------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRReg_Valid, "MoonRacer.NarrativeRegistration.Registration.ValidFixtureIsExplicitOnly", TestFlags)
bool FMRReg_Valid::RunTest(const FString&)
{
	const FString C = TEXT("Valid"); Clean(C);
	const FMRImportReport I = Import(FixtureSrc(), C); TestTrue(TEXT("imported"), I.Outcome == EMRImportOutcome::Imported);
	FNar F;
	TestFalse(TEXT("importing does NOT register anything"), F.N->HasBundle() || F.N->GetRegistration().IsSet());
	const FMRRegistrationResult R = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C));
	TestTrue(TEXT("registered on explicit request"), R.bOk && R.Report.NumErrors() == 0);
	TestTrue(TEXT("registry holds the whole bundle"), F.N->HasBundle() && F.N->NumNpcs() == 2 && F.N->NumGraphs() == 2 && F.N->NumMissions() == 1);
	const FMRActiveReceipt Rc = FMRNarrativeImporter::ReadActive(Root(C), BundleId);
	TestTrue(TEXT("identity recorded: id, hash, classification, environment"), F.N->GetRegistration().BundleId == BundleId && F.N->GetRegistration().BundleHash == Rc.BundleHash && F.N->GetRegistration().Classification == TEXT("TEST_FIXTURE") && F.N->GetRegistration().Environment == EMREnvironment::Development);
	TestTrue(TEXT("versions come from the bundle"), F.N->GetContentVersions().DialogueVersion == Version());
	TestEqual(TEXT("history has one entry"), F.N->RegistrationHistory.Num(), 1);
	TestTrue(TEXT("registered content is usable"), AlphaText().Contains(TEXT("alpha line one")) && F.N->StartConversation(NpcAlpha()));
	F.N->GetRuntime()->Cancel();
	FNar G; Import(FixtureSrc(), C); TestFalse(TEXT("re-importing does not register either"), G.N->HasBundle());
	FMRNarrativeStore::Delete(); Clean(C); RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRReg_Env, "MoonRacer.NarrativeRegistration.Isolation.EnvironmentAndFixtureGates", TestFlags)
bool FMRReg_Env::RunTest(const FString&)
{
	const FString C = TEXT("Env"); Clean(C);
	Import(FixtureSrc(), C);
	FNar F; TestTrue(TEXT("baseline registration"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)).bOk);
	const FString Hash = F.RegHash();
	auto Intact = [&](const TCHAR* L) { TestTrue(FString(L) + TEXT(": registry untouched"), F.RegHash() == Hash && F.N->NumNpcs() == 2 && F.N->RegistrationHistory.Num() == 1); };

	FMRRegistrationRequest NoEnv = Req(C, EMREnvironment::Unspecified);
	const FMRRegistrationResult A = FMRNarrativeRegistrar::Register(F.N.Get(), NoEnv);
	TestTrue(TEXT("an unspecified environment is refused"), !A.bOk && A.Report.HasCode(TEXT("ENV_UNSPECIFIED"))); Intact(TEXT("unspecified"));
	const FMRRegistrationResult B = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C, EMREnvironment::Production));
	TestTrue(TEXT("a fixture bundle is refused in the Production environment"), !B.bOk && B.Report.HasCode(TEXT("FIXTURE_NOT_ALLOWED"))); Intact(TEXT("production request"));
	const FMRRegistrationResult D = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C, EMREnvironment::Development, TEXT("NO_SUCH_BUNDLE")));
	TestTrue(TEXT("an unknown bundle id is refused"), !D.bOk && D.Report.HasCode(TEXT("NO_ACTIVE_BUNDLE"))); Intact(TEXT("unknown id"));

	{	// a PRODUCTION PROCESS: fixtures are unreachable even if a caller asks for Development
		FEnvGuard G(EMREnvironment::Production);
		const FMRRegistrationResult P = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C, EMREnvironment::Development));
		TestTrue(TEXT("a Production process refuses a Development registration"), !P.bOk && P.Report.HasCode(TEXT("ENV_NOT_PERMITTED"))); Intact(TEXT("production process"));
		FNar H; FMRNarrativeBundle Bundle = Build(H.GI.Get()); RegisterStrings(); FMRValidationReport V;
		TestFalse(TEXT("direct RegisterBundle also refuses fixtures in a Production process, whatever the policy says"), H.N->RegisterBundle(Bundle, FMRValidationPolicy(), V));
		TestTrue(TEXT("with FIXTURE_NOT_ALLOWED"), V.HasCode(TEXT("FIXTURE_NOT_ALLOWED")));
		FNar L; FMRNarrativeBundle LB; FMRValidationReport LV;
		TestFalse(TEXT("production-only loading refuses the fixture bundle"), FMRNarrativeImporter::LoadActive(Root(C), BundleId, LB, LV, true));
	}
	TestTrue(TEXT("the override is released"), MRNarrative::CurrentEnvironment() == EMREnvironment::Development);
	TestFalse(TEXT("the live onboarding flow content is not bound to any registered bundle"), F.N->GetRegistration().BundleId.IsEmpty());
	FMRNarrativeStore::Delete(); Clean(C); RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRReg_Identity, "MoonRacer.NarrativeRegistration.Validation.IdentityProvenanceAndInvalidBundles", TestFlags)
bool FMRReg_Identity::RunTest(const FString&)
{
	const FString C = TEXT("Identity"); Clean(C);
	Import(FixtureSrc(), C);
	FNar F; TestTrue(TEXT("baseline"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)).bOk);
	const FString Hash = F.RegHash(); const FString Text0 = AlphaText();
	auto Intact = [&](const TCHAR* L) { TestTrue(FString(L) + TEXT(": previous registry intact"), F.RegHash() == Hash && F.N->NumGraphs() == 2 && AlphaText() == Text0); };
	const FString H12 = Hash.Left(12);

	// identity checks on the loaded bundle
	{ FMRLoadedBundle L; FMRValidationReport V; FMRNarrativeImporter::LoadFolder(Root(C), BundleId, H12, L, V);
	  { FMRRegistrationRequest Q = Req(C, EMREnvironment::Development, TEXT("OTHER_BUNDLE")); const FMRRegistrationResult R = FMRNarrativeRegistrar::RegisterLoaded(F.N.Get(), Q, L); TestTrue(TEXT("a bundle id that is not the requested one is refused"), !R.bOk && R.Report.HasCode(TEXT("IDENTITY_MISMATCH"))); Intact(TEXT("wrong id")); }
	  { FMRRegistrationRequest Q = Req(C); Q.BundleHash = TEXT("000000000000"); const FMRRegistrationResult R = FMRNarrativeRegistrar::RegisterLoaded(F.N.Get(), Q, L); TestTrue(TEXT("a pinned hash that does not match is refused"), !R.bOk && R.Report.HasCode(TEXT("IDENTITY_MISMATCH"))); Intact(TEXT("wrong hash")); }
	  { L.Bundle.Npcs[0]->ContentVersion = FName("OTHER"); const FMRRegistrationResult R = FMRNarrativeRegistrar::RegisterLoaded(F.N.Get(), Req(C), L); TestTrue(TEXT("a record version that differs from the bundle version is refused"), !R.bOk && R.Report.HasCode(TEXT("VERSION_MISMATCH"))); Intact(TEXT("version")); L.Bundle.Npcs[0]->ContentVersion = Version(); }
	  { L.Bundle.Npcs[0]->bTestFixture = false; const FMRRegistrationResult R = FMRNarrativeRegistrar::RegisterLoaded(F.N.Get(), Req(C), L); TestTrue(TEXT("a record whose fixture flag contradicts the bundle is refused"), !R.bOk && R.Report.HasCode(TEXT("CLASSIFICATION_MISMATCH"))); Intact(TEXT("classification")); L.Bundle.Npcs[0]->bTestFixture = true; }
	  { const FName Keep = L.Bundle.Graphs[0]->StartNodeId; L.Bundle.Graphs[0]->StartNodeId = FName("zz"); const FMRRegistrationResult R = FMRNarrativeRegistrar::RegisterLoaded(F.N.Get(), Req(C), L); TestTrue(TEXT("an invalid graph is refused with actionable diagnostics"), !R.bOk && R.Report.HasCode(TEXT("BAD_START")) && !R.Report.Items[0].Message.IsEmpty()); Intact(TEXT("invalid graph")); L.Bundle.Graphs[0]->StartNodeId = Keep; }
	  { L.Strings.Remove(TableId()); const FMRRegistrationResult R = FMRNarrativeRegistrar::RegisterLoaded(F.N.Get(), Req(C), L); TestTrue(TEXT("missing string tables are refused"), !R.bOk && R.Report.HasCode(TEXT("MISSING_STRING_KEY"))); Intact(TEXT("strings")); } }

	// tampering with the generated folder on disk
	const FString Dir = FMRNarrativeImporter::BundleDir(Root(C), BundleId) / H12;
	{ FJ M = LoadJ(Dir / TEXT("COMPLETE.json")); FJ Recs = M->GetObjectField(TEXT("records")); Recs->SetStringField(TEXT("npc:TEST_FIXTURE_NPC_ALPHA"), TEXT("0000")); SaveJ(Dir / TEXT("COMPLETE.json"), M);
	  const FMRRegistrationResult R = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)); TestTrue(TEXT("a record that does not match its recorded import hash is refused"), !R.bOk && R.Report.HasCode(TEXT("IDENTITY_MISMATCH"))); Intact(TEXT("tampered record")); }
	{ const FString Cp = Dir / TEXT("COMPLETE.json"); FString T; FFileHelper::LoadFileToString(T, *Cp); IFileManager::Get().Delete(*Cp);
	  const FMRRegistrationResult R = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)); TestTrue(TEXT("a folder without its completion marker is refused"), !R.bOk && R.Report.HasCode(TEXT("INCOMPLETE_BUNDLE"))); Intact(TEXT("incomplete")); }

	// provenance on a (synthetic) production bundle
	const FString CP = TEXT("IdentityProd"); Clean(CP);
	const FString SD = WriteSynth(CP, TEXT("src"), TEXT("SYNTHETIC_V1"), TEXT("SYNTHETIC_FX_A"));
	TestTrue(TEXT("synthetic production bundle imports (validator-only data)"), Import(SD, CP).Outcome == EMRImportOutcome::Imported);
	FNar P;
	{ FMRLoadedBundle L; FMRValidationReport V; FMRNarrativeImporter::LoadFolder(Root(CP), SynthId, FMRNarrativeImporter::ReadActive(Root(CP), SynthId).BundleHash.Left(12), L, V);
	  { const UMRNarrativeRecordBase* B0 = L.Bundle.Npcs[0]; const_cast<UMRNarrativeRecordBase*>(B0)->Provenance.ApprovalId = NAME_None;
	    const FMRRegistrationResult R = FMRNarrativeRegistrar::RegisterLoaded(P.N.Get(), Req(CP, EMREnvironment::Production, SynthId), L); TestTrue(TEXT("a production record with no approval id is refused"), !R.bOk && R.Report.HasCode(TEXT("MISSING_PROVENANCE"))); TestFalse(TEXT("and nothing was registered"), P.N->HasBundle()); const_cast<UMRNarrativeRecordBase*>(B0)->Provenance.ApprovalId = FName("SYNTHETIC_APPROVAL"); }
	  { L.Bundle.Npcs[0]->bTestFixture = true; const FMRRegistrationResult R = FMRNarrativeRegistrar::RegisterLoaded(P.N.Get(), Req(CP, EMREnvironment::Production, SynthId), L); TestTrue(TEXT("a fixture-flagged record in a production bundle is refused"), !R.bOk && (R.Report.HasCode(TEXT("FIXTURE_NOT_ALLOWED")) || R.Report.HasCode(TEXT("CLASSIFICATION_MISMATCH")))); L.Bundle.Npcs[0]->bTestFixture = false; }
	  { L.Strings[FName("SYNTHETIC_VALIDATOR_ONLY_STRINGS")].Add(FName("t"), TEXT("TEST FIXTURE - NONCANON: leaked")); const FMRRegistrationResult R = FMRNarrativeRegistrar::RegisterLoaded(P.N.Get(), Req(CP, EMREnvironment::Production, SynthId), L); TestTrue(TEXT("fixture text is refused in production"), !R.bOk && R.Report.HasCode(TEXT("PRODUCTION_FIXTURE_TEXT"))); } }
	const FMRRegistrationResult OkProd = FMRNarrativeRegistrar::Register(P.N.Get(), Req(CP, EMREnvironment::Production, SynthId));
	TestTrue(TEXT("a well-formed approved synthetic bundle registers in Production"), OkProd.bOk && P.N->GetRegistration().Environment == EMREnvironment::Production);
	FMRNarrativeStore::Delete(); Clean(C); Clean(CP); RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRReg_Atomic, "MoonRacer.NarrativeRegistration.Registration.FailureRestoresThePreviousRegistry", TestFlags)
bool FMRReg_Atomic::RunTest(const FString&)
{
	const FString C = TEXT("Atomic"); Clean(C);
	Import(Variant(C, TEXT("v1"), TEXT("TEST_FIXTURE_V1")), C);
	FNar F; TestTrue(TEXT("v1 registered"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)).bOk);
	const FString Hash1 = F.RegHash(); const FString Text1 = AlphaText();
	Import(Variant(C, TEXT("v2"), TEXT("TEST_FIXTURE_V2"), TEXT("alpha line SECOND")), C);   // v2 becomes ACTIVE on disk (not registered)
	TestTrue(TEXT("importing v2 did not touch the registry"), F.RegHash() == Hash1 && AlphaText() == Text1);
	FEnvGuard G(EMREnvironment::Unspecified);
	for (int32 Step = 1; Step <= 3; ++Step)
	{
		FMRNarrativeRegistrar::GFailAtStep = Step;
		const FMRRegistrationResult R = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C));
		FMRNarrativeRegistrar::GFailAtStep = 0;
		const FString L = FString::Printf(TEXT("failure at step %d"), Step);
		TestTrue(L + TEXT(" reported"), !R.bOk && R.Report.HasCode(TEXT("REGISTRATION_FAILED")));
		TestTrue(L + TEXT(": previous registry identity restored"), F.RegHash() == Hash1 && F.N->GetRegistration().BundleHash == Hash1);
		TestTrue(L + TEXT(": all records restored"), F.N->NumNpcs() == 2 && F.N->NumGraphs() == 2 && F.N->NumMissions() == 1 && F.N->GetContentVersions().DialogueVersion == FName("TEST_FIXTURE_V1"));
		TestTrue(L + TEXT(": previous string table restored (old text)"), AlphaText() == Text1);
		TestEqual(L + TEXT(": history unchanged"), F.N->RegistrationHistory.Num(), 1);
		TestTrue(L + TEXT(": still usable"), F.N->StartConversation(NpcAlpha()) && F.N->GetRuntime()->GetView().Text.ToString() == Text1); F.N->GetRuntime()->Cancel();
	}
	const FMRRegistrationResult Ok = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C));
	TestTrue(TEXT("without the injected failure the same registration succeeds"), Ok.bOk && F.RegHash() != Hash1 && AlphaText().Contains(TEXT("SECOND")) && F.N->RegistrationHistory.Num() == 2);
	FMRNarrativeStore::Delete(); Clean(C); RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRReg_Rollback, "MoonRacer.NarrativeRegistration.Registration.ExplicitRollback", TestFlags)
bool FMRReg_Rollback::RunTest(const FString&)
{
	const FString C = TEXT("Rollback"); Clean(C);
	Import(Variant(C, TEXT("v1"), TEXT("TEST_FIXTURE_V1")), C);
	const FString Hash1 = FMRNarrativeImporter::ReadActive(Root(C), BundleId).BundleHash;
	FNar F; TestTrue(TEXT("v1"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)).bOk);
	const FMRRegistrationResult NoPrev = FMRNarrativeRegistrar::Rollback(F.N.Get(), Req(C));
	TestTrue(TEXT("nothing to roll back to yet"), !NoPrev.bOk && NoPrev.Report.HasCode(TEXT("NO_PREVIOUS_BUNDLE")) && F.RegHash() == Hash1);
	Import(Variant(C, TEXT("v2"), TEXT("TEST_FIXTURE_V2"), TEXT("alpha line SECOND")), C);
	TestTrue(TEXT("v2 registered explicitly"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)).bOk && AlphaText().Contains(TEXT("SECOND")) && F.N->RegistrationHistory.Num() == 2);
	const FMRRegistrationResult RB = FMRNarrativeRegistrar::Rollback(F.N.Get(), Req(C));
	TestTrue(TEXT("rollback re-registers v1 after full re-verification"), RB.bOk && F.RegHash() == Hash1 && AlphaText().Contains(TEXT("alpha line one")) && F.N->GetContentVersions().DialogueVersion == FName("TEST_FIXTURE_V1"));
	TestEqual(TEXT("history is [v1]"), F.N->RegistrationHistory.Num(), 1);
	TestTrue(TEXT("rollback to nothing refused again"), !FMRNarrativeRegistrar::Rollback(F.N.Get(), Req(C)).bOk);
	// explicit registration of a historical folder by hash while v2 is ACTIVE on disk
	FMRRegistrationRequest Pin = Req(C); Pin.BundleHash = Hash1.Left(12);
	TestTrue(TEXT("a historical bundle can be registered explicitly by hash"), FMRNarrativeRegistrar::Register(F.N.Get(), Pin).bOk && F.RegHash() == Hash1);
	// a rollback target that no longer verifies is refused and the registry is preserved
	Import(Variant(C, TEXT("v2b"), TEXT("TEST_FIXTURE_V2"), TEXT("alpha line SECOND")), C);
	TestTrue(TEXT("v2 again"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)).bOk);
	const FString Hash2 = F.RegHash(); const FString V1Complete = FMRNarrativeImporter::BundleDir(Root(C), BundleId) / Hash1.Left(12) / TEXT("COMPLETE.json");
	IFileManager::Get().Delete(*V1Complete);
	const FMRRegistrationResult Bad = FMRNarrativeRegistrar::Rollback(F.N.Get(), Req(C));
	TestTrue(TEXT("rollback to a damaged folder is refused"), !Bad.bOk && Bad.Report.HasCode(TEXT("INCOMPLETE_BUNDLE")));
	TestTrue(TEXT("and the current registry is preserved"), F.RegHash() == Hash2 && AlphaText().Contains(TEXT("SECOND")));
	FMRNarrativeStore::Delete(); Clean(C); RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRReg_Saves, "MoonRacer.NarrativeRegistration.Compatibility.ExistingNarrativeSaves", TestFlags)
bool FMRReg_Saves::RunTest(const FString&)
{
	const FString C = TEXT("Saves"); Clean(C);
	const FString V1 = Variant(C, TEXT("v1"), TEXT("TEST_FIXTURE_V1")); Import(V1, C);
	FNar F; TestTrue(TEXT("v1 registered"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)).bOk);
	F.PlayAlphaYes(); F.N->NotifyGameEvent(EvtObj1());
	const FMRNarrativeState Before = F.N->GetState(); const FString BeforeStr = Before.ToCanonicalString();
	TestTrue(TEXT("player has progress"), F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active && F.N->IsObjectiveCompleted(Obj1()) && F.N->GetState().FiredEffects.Contains(FxAccept()));

	// v2: compatible (text/version change, effect id renamed WITHOUT migration => dev warning only)
	const FString V2 = Variant(C, TEXT("v2"), TEXT("TEST_FIXTURE_V2"), TEXT("alpha line SECOND"));
	EditJ(V2, TEXT("dialogues.json"), [](const FJ& O) { O->GetArrayField(TEXT("records"))[0]->AsObject()->GetArrayField(TEXT("nodes"))[0]->AsObject()->GetArrayField(TEXT("onEnter"))[0]->AsObject()->SetStringField(TEXT("effectId"), TEXT("TEST_FIXTURE_FX_MET_RENAMED")); });
	const FMRImportReport I2 = Import(V2, C); TestTrue(TEXT("v2 imports with a development warning"), I2.Outcome == EMRImportOutcome::Imported && I2.Validation.HasCode(TEXT("EFFECT_ID_CHANGED")));
	const FMRRegistrationResult R2 = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C));
	TestTrue(TEXT("v2 registers over the existing save"), R2.bOk && R2.Load.bVersionMismatch && R2.Notes.Num() >= 1);
	TestTrue(TEXT("progress NOT reset: state identical (facts, completed dialogues, mission, objectives, one-time history)"), F.N->GetState().ToCanonicalString() == BeforeStr);
	TestTrue(TEXT("mission still active with objective 2 current"), F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active && F.N->GetTrackedObjective().ObjectiveId == Obj2());

	// v3: removes the mission the player has ACTIVE => conflict; registry and save preserved
	const FString V3 = Variant(C, TEXT("v3"), TEXT("TEST_FIXTURE_V3"), TEXT("alpha line THIRD"));
	EditJ(V3, TEXT("missions.json"), [](const FJ& O) { MutArr(O, TEXT("records"), [](FArr& A) { A.Empty(); }); });
	EditJ(V3, TEXT("dialogues.json"), [](const FJ& O)
	{
		auto Strip = [](const FJ& Owner, const TCHAR* Field) { if (!Owner->HasField(Field)) return; MutArr(Owner, Field, [](FArr& Fx) { Fx.RemoveAll([](const TSharedPtr<FJsonValue>& E) { const FString T = E->AsObject()->GetStringField(TEXT("type")); return T == TEXT("offer_mission") || T == TEXT("accept_mission"); }); }); };
		for (const TSharedPtr<FJsonValue>& G : O->GetArrayField(TEXT("records"))) for (const TSharedPtr<FJsonValue>& N : G->AsObject()->GetArrayField(TEXT("nodes"))) { const FJ NO = N->AsObject(); Strip(NO, TEXT("onEnter")); if (NO->HasField(TEXT("choices"))) for (const TSharedPtr<FJsonValue>& Ch : NO->GetArrayField(TEXT("choices"))) Strip(Ch->AsObject(), TEXT("effects")); }
	});
	TestTrue(TEXT("v3 imports"), Import(V3, C).Outcome == EMRImportOutcome::Imported);
	const FString Hash2 = F.RegHash(); TArray<uint8> SaveBytes; FFileHelper::LoadFileToArray(SaveBytes, *FMRNarrativeStore::FilePath());
	const FMRRegistrationResult R3 = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C));
	TestTrue(TEXT("an Active mission missing from the new bundle is a reported conflict"), !R3.bOk && R3.Report.HasCode(TEXT("ACTIVE_MISSION_REMOVED")) && R3.Conflicts.Num() == 1);
	TestTrue(TEXT("registry preserved"), F.RegHash() == Hash2 && F.N->NumMissions() == 1 && AlphaText().Contains(TEXT("SECOND")));
	TArray<uint8> After; FFileHelper::LoadFileToArray(After, *FMRNarrativeStore::FilePath());
	TestTrue(TEXT("the save file is byte-identical"), After == SaveBytes && F.N->GetState().ToCanonicalString() == BeforeStr);
	// explicit acknowledgement registers it; progress is retained but not applied
	FMRRegistrationRequest Accept = Req(C); Accept.bAcceptRemovedMissions = true;
	const FMRRegistrationResult R3b = FMRNarrativeRegistrar::Register(F.N.Get(), Accept);
	TestTrue(TEXT("with an explicit acknowledgement it registers"), R3b.bOk && F.N->NumMissions() == 0);
	TestTrue(TEXT("saved mission progress, facts, dialogues and ledger are retained"), F.N->GetState().Missions.Contains(Mission()) && F.N->GetState().CompletedObjectives.Contains(Obj1()) && F.N->GetState().FiredEffects.Contains(FxAccept()) && F.N->GetState().CompletedDialogues.Contains(GraphAlpha()));
	// rollback restores the mission and the saved progress applies again
	const FMRRegistrationResult RB = FMRNarrativeRegistrar::Rollback(F.N.Get(), Req(C));
	TestTrue(TEXT("rollback to v2 succeeds and the mission is live again"), RB.bOk && F.RegHash() == Hash2 && F.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active && F.N->GetTrackedObjective().ObjectiveId == Obj2());
	TestTrue(TEXT("state is still identical to the original progress"), F.N->GetState().ToCanonicalString() == BeforeStr);

	// v4: objective order changed incompatibly with the recorded completions
	const FString V4 = Variant(C, TEXT("v4"), TEXT("TEST_FIXTURE_V4"), TEXT("alpha line FOURTH"));
	EditJ(V4, TEXT("missions.json"), [](const FJ& O) { MutArr(O->GetArrayField(TEXT("records"))[0]->AsObject(), TEXT("objectives"), [](FArr& A) { A.Swap(0, 1); }); });
	TestTrue(TEXT("v4 imports"), Import(V4, C).Outcome == EMRImportOutcome::Imported);
	const FMRRegistrationResult R4 = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C));
	TestTrue(TEXT("an incompatible objective order is a reported conflict"), !R4.bOk && R4.Report.HasCode(TEXT("OBJECTIVE_ORDER_CONFLICT")) && F.RegHash() == Hash2);

	// a save written by a NEWER build is never overwritten and blocks registration
	{
		FNar G; UMRNarrativeSaveGame* Newer = NewObject<UMRNarrativeSaveGame>(GetTransientPackage()); Newer->SaveVersion = MRNarrative::CurrentNarrativeSaveVersion + 3; Newer->Facts = { FName("FROM_THE_FUTURE") }; Newer->Checksum = Newer->ComputeChecksum();
		FMRNarrativeStore::WriteForTest(Newer); TArray<uint8> Fut; FFileHelper::LoadFileToArray(Fut, *FMRNarrativeStore::FilePath());
		Import(V1, C);   // (no-op/rollback of the ACTIVE pointer is irrelevant here: pin to v1)
		FMRRegistrationRequest Pin = Req(C); Pin.BundleHash = FMRNarrativeImporter::ReadActive(Root(C), BundleId).BundleHash.Left(12);
		const FMRRegistrationResult RN = FMRNarrativeRegistrar::Register(G.N.Get(), Pin);
		TestTrue(TEXT("a newer-version save refuses registration"), !RN.bOk && RN.Report.HasCode(TEXT("SAVE_NEWER_VERSION")) && !G.N->HasBundle());
		TArray<uint8> Fut2; FFileHelper::LoadFileToArray(Fut2, *FMRNarrativeStore::FilePath()); TestTrue(TEXT("and the save is byte-identical"), Fut2 == Fut);
	}
	FMRNarrativeStore::Delete(); Clean(C); RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRReg_EffectIds, "MoonRacer.NarrativeRegistration.Hardening.OneTimeEffectIdMigrations", TestFlags)
bool FMRReg_EffectIds::RunTest(const FString&)
{
	// ---- development fixtures: warnings, and approved migrations carry saved ledgers
	{
		const FString C = TEXT("EffDev"); Clean(C);
		Import(Variant(C, TEXT("v1"), TEXT("TEST_FIXTURE_V1")), C);
		auto Rename = [&](const FString& Name, TFunction<void(const FString&)> Extra) { const FString D = Variant(C, Name, TEXT("TEST_FIXTURE_V2"), TEXT("alpha line SECOND")); EditJ(D, TEXT("dialogues.json"), [](const FJ& O) { O->GetArrayField(TEXT("records"))[0]->AsObject()->GetArrayField(TEXT("nodes"))[0]->AsObject()->GetArrayField(TEXT("onEnter"))[0]->AsObject()->SetStringField(TEXT("effectId"), TEXT("TEST_FIXTURE_FX_MET_RENAMED")); }); if (Extra) Extra(D); return D; };
		auto Mig = [](const FString& From, const FString& To, const FString& Action, const FString& Appr) { return [=](const FString& D) { EditJ(D, TEXT("bundle.json"), [&](const FJ& M) { FJ X = MakeShared<FJsonObject>(); X->SetStringField(TEXT("from"), From); if (!To.IsEmpty()) X->SetStringField(TEXT("to"), To); X->SetStringField(TEXT("action"), Action); if (!Appr.IsEmpty()) X->SetStringField(TEXT("approvalId"), Appr); M->SetArrayField(TEXT("effectMigrations"), { MakeShared<FJsonValueObject>(X) }); }); }; };
		const FMRImportReport NoMig = Import(Rename(TEXT("nomig"), nullptr), C, false);
		TestTrue(TEXT("dev: a renamed effect id without a migration only WARNS"), NoMig.Ok() && NoMig.Validation.HasCode(TEXT("EFFECT_ID_CHANGED")) && NoMig.Impact.ContainsByPredicate([](const FString& S) { return S.Contains(TEXT("WARNING")); }));
		struct FBad { const TCHAR* Name; const TCHAR* Code; TFunction<void(const FString&)> Fn; };
		const TArray<FBad> Bad = {
			{ TEXT("unknownsrc"), TEXT("MIGRATION_UNKNOWN_SOURCE"),       Mig(TEXT("TEST_FIXTURE_FX_NEVER_EXISTED"), TEXT("TEST_FIXTURE_FX_MET_RENAMED"), TEXT("rename"), TEXT("APPROVAL_1")) },
			{ TEXT("srcpresent"), TEXT("MIGRATION_SOURCE_STILL_PRESENT"), Mig(TEXT("TEST_FIXTURE_FX_OFFER"), TEXT("TEST_FIXTURE_FX_MET_RENAMED"), TEXT("rename"), TEXT("APPROVAL_1")) },
			{ TEXT("notarget"),   TEXT("MIGRATION_TARGET_MISSING"),       Mig(TEXT("TEST_FIXTURE_FX_MET"), TEXT("TEST_FIXTURE_FX_NOWHERE"), TEXT("rename"), TEXT("APPROVAL_1")) },
			{ TEXT("noapproval"), TEXT("SCHEMA_MISSING_FIELD"),           Mig(TEXT("TEST_FIXTURE_FX_MET"), TEXT("TEST_FIXTURE_FX_MET_RENAMED"), TEXT("rename"), TEXT("")) },
			{ TEXT("badaction"),  TEXT("SCHEMA_ENUM"),                    Mig(TEXT("TEST_FIXTURE_FX_MET"), TEXT("TEST_FIXTURE_FX_MET_RENAMED"), TEXT("explode"), TEXT("APPROVAL_1")) },
		};
		for (const FBad& B : Bad) { const FMRImportReport R = Import(Rename(B.Name, B.Fn), C, false); TestTrue(FString(B.Name) + TEXT(" rejected with ") + B.Code, R.Outcome == EMRImportOutcome::Rejected && R.Validation.HasCode(B.Code)); }

		const FString Good = Rename(TEXT("good"), Mig(TEXT("TEST_FIXTURE_FX_MET"), TEXT("TEST_FIXTURE_FX_MET_RENAMED"), TEXT("rename"), TEXT("APPROVAL_1")));
		const FMRImportReport G = Import(Good, C, false);
		TestTrue(TEXT("an approved rename migration is accepted with no warning"), G.Ok() && !G.Validation.HasCode(TEXT("EFFECT_ID_CHANGED")) && G.Impact.ContainsByPredicate([](const FString& S) { return S.Contains(TEXT("MIGRATED")) && S.Contains(TEXT("will not fire again")); }));
		// the migration carries the ledger into the saved state, so the renamed effect does not fire again
		FNar F; TestTrue(TEXT("v1 registered"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)).bOk);
		F.PlayAlphaYes(); TestTrue(TEXT("old effect id in the ledger"), F.N->GetState().FiredEffects.Contains(FName("TEST_FIXTURE_FX_MET")));
		TestTrue(TEXT("v2 (with migration) imports"), Import(Good, C).Outcome == EMRImportOutcome::Imported);
		TestTrue(TEXT("v2 registers"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C)).bOk);
		TestTrue(TEXT("the ledger carries the NEW id and keeps the old one"), F.N->GetState().FiredEffects.Contains(FName("TEST_FIXTURE_FX_MET_RENAMED")) && F.N->GetState().FiredEffects.Contains(FName("TEST_FIXTURE_FX_MET")));
		const int32 Applied = F.N->EffectsApplied; F.N->GetRuntime()->Start(GraphAlpha());
		TestTrue(TEXT("replaying does not fire the renamed effect again"), F.N->EffectsApplied == Applied && F.N->EffectsSuppressed >= 1); F.N->GetRuntime()->Cancel();
		FMRNarrativeStore::Delete(); Clean(C);
	}
	// ---- PRODUCTION rules (synthetic validator-only bundles)
	{
		const FString C = TEXT("EffProd"); Clean(C);
		Import(WriteSynth(C, TEXT("p1"), TEXT("SYNTHETIC_V1"), TEXT("SYNTHETIC_FX_A")), C);
		auto Mig = [](const FString& From, const FString& To, const FString& Action, const FString& Appr) { return [=](const FString& D) { EditJ(D, TEXT("bundle.json"), [&](const FJ& M) { FJ X = MakeShared<FJsonObject>(); X->SetStringField(TEXT("from"), From); if (!To.IsEmpty()) X->SetStringField(TEXT("to"), To); X->SetStringField(TEXT("action"), Action); X->SetStringField(TEXT("approvalId"), Appr); M->SetArrayField(TEXT("effectMigrations"), { MakeShared<FJsonValueObject>(X) }); }); }; };
		const FMRImportReport Ren = Import(WriteSynth(C, TEXT("renamed"), TEXT("SYNTHETIC_V2"), TEXT("SYNTHETIC_FX_B")), C, false);
		TestTrue(TEXT("production: a renamed one-time effect id without an approved migration is REJECTED"), Ren.Outcome == EMRImportOutcome::Rejected && Ren.Validation.HasCode(TEXT("EFFECT_ID_MIGRATION_REQUIRED")));
		const FMRImportReport Rem = Import(WriteSynth(C, TEXT("removed"), TEXT("SYNTHETIC_V2"), TEXT(""), false), C, false);
		TestTrue(TEXT("production: a removed one-time effect id without an approved migration is REJECTED"), Rem.Outcome == EMRImportOutcome::Rejected && Rem.Validation.HasCode(TEXT("EFFECT_ID_MIGRATION_REQUIRED")));
		const FMRImportReport OkRen = Import(WriteSynth(C, TEXT("okrename"), TEXT("SYNTHETIC_V2"), TEXT("SYNTHETIC_FX_B"), true, Mig(TEXT("SYNTHETIC_FX_A"), TEXT("SYNTHETIC_FX_B"), TEXT("rename"), TEXT("SYNTHETIC_APPROVAL"))), C, false);
		TestTrue(TEXT("production: an explicit approved rename migration is accepted"), OkRen.Ok());
		const FMRImportReport OkRet = Import(WriteSynth(C, TEXT("okretire"), TEXT("SYNTHETIC_V3"), TEXT(""), false, Mig(TEXT("SYNTHETIC_FX_A"), TEXT(""), TEXT("retire"), TEXT("SYNTHETIC_APPROVAL"))), C, false);
		TestTrue(TEXT("production: an explicit approved retirement is accepted"), OkRet.Ok() && OkRet.Impact.ContainsByPredicate([](const FString& S) { return S.Contains(TEXT("retired")); }));
		// registration refuses a ledger entry that the production bundle neither contains nor migrates
		FNar F; F.N->StateForTest().FiredEffects.Add(FName("SYNTHETIC_FX_UNKNOWN")); F.N->bAutoSave = false;
		const FMRRegistrationResult R = FMRNarrativeRegistrar::Register(F.N.Get(), Req(C, EMREnvironment::Production, SynthId));
		TestTrue(TEXT("production registration refuses a saved one-time effect id that is neither present nor migrated"), !R.bOk && R.Report.HasCode(TEXT("EFFECT_HISTORY_CONFLICT")) && !F.N->HasBundle());
		F.N->StateForTest().FiredEffects.Empty();
		TestTrue(TEXT("and registers once the ledger is consistent"), FMRNarrativeRegistrar::Register(F.N.Get(), Req(C, EMREnvironment::Production, SynthId)).bOk);
		FMRNarrativeStore::Delete(); Clean(C);
	}
	RegisterStrings(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRReg_DupKeys, "MoonRacer.NarrativeRegistration.Hardening.DuplicateJsonKeysAreRejected", TestFlags)
bool FMRReg_DupKeys::RunTest(const FString&)
{
	struct FCase { const TCHAR* Name; const TCHAR* File; FString Find; FString With; const TCHAR* Contains; };
	const TArray<FCase> Cases = {
		{ TEXT("TopLevelManifest"),   TEXT("bundle.json"),    TEXT("\"bundleId\": \"TEST_FIXTURE_BUNDLE\","), TEXT("\"bundleId\": \"TEST_FIXTURE_BUNDLE\", \"bundleId\": \"OTHER\","), TEXT("bundleId") },
		{ TEXT("NestedNode"),         TEXT("dialogues.json"), TEXT("\"id\": \"n_start\","),                   TEXT("\"id\": \"n_start\", \"id\": \"n_other\","), TEXT("nodes[0]") },
		{ TEXT("DeepChoice"),         TEXT("dialogues.json"), TEXT("\"id\": \"c_yes\","),                     TEXT("\"id\": \"c_yes\", \"id\": \"c_yes2\","), TEXT("choices") },
		{ TEXT("DeepEffect"),         TEXT("dialogues.json"), TEXT("\"type\": \"offer_mission\","),           TEXT("\"type\": \"offer_mission\", \"type\": \"set_fact\","), TEXT("effects") },
		{ TEXT("StringsEntry"),       TEXT("strings.json"),   TEXT("\"alpha_1\":"),                            TEXT("\"alpha_1\": \"first\", \"alpha_1\":"), TEXT("alpha_1") },
		{ TEXT("Provenance"),         TEXT("npcs.json"),      TEXT("\"sourceDocumentId\": \"TEST_FIXTURE_NONCANON\","), TEXT("\"sourceDocumentId\": \"A\", \"sourceDocumentId\": \"TEST_FIXTURE_NONCANON\","), TEXT("provenance") },
	};
	for (const FCase& K : Cases)
	{
		const FString C = FString(TEXT("Dup_")) + K.Name; Clean(C);
		const FString D = Variant(C, TEXT("src"), TEXT("TEST_FIXTURE_V1")); Replace(D, K.File, K.Find, K.With);
		const FMRImportReport R = Import(D, C);
		const FString L = FString(K.Name);
		TestTrue(L + TEXT(" rejected with DUPLICATE_KEY"), R.Outcome == EMRImportOutcome::Rejected && R.Validation.HasCode(TEXT("DUPLICATE_KEY")));
		bool bPath = false; for (const FMRDiagnostic& X : R.Validation.Items) if (X.Code == FName("DUPLICATE_KEY") && X.Message.Contains(K.Contains)) bPath = true;
		TestTrue(L + TEXT(" names the key/object path"), bPath);
		TestFalse(L + TEXT(" nothing written"), IFileManager::Get().DirectoryExists(*FMRNarrativeImporter::BundleDir(Root(C), BundleId)));
		Clean(C);
	}
	const FString C = TEXT("Dup_Clean"); Clean(C);
	const FMRImportReport Ok = Import(FixtureSrc(), C, false);
	TestTrue(TEXT("the unmodified fixture bundle has no duplicate keys and stays strictly valid"), Ok.Ok() && !Ok.Validation.HasCode(TEXT("DUPLICATE_KEY")));
	// strict schema is preserved
	const FString D = Variant(C, TEXT("strict"), TEXT("TEST_FIXTURE_V1")); Replace(D, TEXT("npcs.json"), TEXT("\"stringTable\":"), TEXT("\"bogus\": 1, \"stringTable\":"));
	TestTrue(TEXT("unknown fields are still rejected"), Import(D, C, false).Validation.HasCode(TEXT("SCHEMA_UNKNOWN_FIELD")));
	Clean(C); return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
