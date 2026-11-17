// Moon Racer - checkpoint v2 + migration foundation tests (Phase 3B P5B-3A). Run:
//   UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer.CheckpointV2; Quit" -unattended -nullrhi -nosplash -nosound
// Implements the migration test matrix of the approved P5B-2 proposal (M01-M32). Dedicated slots ONLY (MRProgress_CheckpointV2Test,
// MRAvatar_CheckpointV2Test, MRNarrative_CheckpointV2Test); default player slots are never touched. All ids are TEST FIXTURE - NONCANON stand-ins.
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Avatar/MRAvatarCatalog.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Engine/GameInstance.h"
#include "HAL/FileManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Onboarding/MRCheckpointV2Store.h"
#include "UObject/StrongObjectPtr.h"

namespace
{
	constexpr EAutomationTestFlags TestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;
	const TCHAR* Base = TEXT("MRProgress_CheckpointV2Test");
	const TCHAR* AvatarSlot = TEXT("MRAvatar_CheckpointV2Test");
	const TCHAR* NarrSlot = TEXT("MRNarrative_CheckpointV2Test");
	const FName TavianDlg("TEST_FIXTURE_DIALOGUE_TAVIAN_STANDIN");
	const FName TavianFx1("TEST_FIXTURE_FX_TAVIAN_1"), TavianFx2("TEST_FIXTURE_FX_TAVIAN_2");
	const FName CoreLoc("TEST_FIXTURE_NONCANON_LOCATION");
	using EState = EMROnboardingState;

	void CleanProgress()
	{
		FMRProgressStore::SetSlotBaseOverride(Base); FMRProgressStore::DeleteBoth();
		for (bool bB : { false, true }) for (const FString& P : FMRCheckpointV2Store::ListBackups(bB)) IFileManager::Get().Delete(*P, false, true, true);   // test slot only
		FMRCheckpointV2Store::GFailPoint = FMRCheckpointV2Store::EFailPoint::None;
	}
	TArray<uint8> Bytes(bool bB) { TArray<uint8> A; FFileHelper::LoadFileToArray(A, *FMRProgressStore::SlotFilePath(bB)); return A; }
	bool Exists(bool bB) { return IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(bB)); }
	int32 NumBackups() { return FMRCheckpointV2Store::ListBackups(false).Num() + FMRCheckpointV2Store::ListBackups(true).Num(); }

	// a CONSISTENT v1 record exactly as the v1 machine writes it while the player is AT state S
	FMRProgressRecord V1At(EState S)
	{
		FMRProgressRecord R = FMRProgressRecord::MakeNew(); const int32 I = (int32)S; R.CurrentState = MROnboarding::StateId(S);
		FMRProgressFlags& F = R.Flags;
		F.bAccessResolved = I > (int32)EState::AccessCheck; F.bPassportChecked = I > (int32)EState::PassportCheck; F.bAvatarConfirmed = I > (int32)EState::AvatarCheck;
		F.bArrivalSeen = I > (int32)EState::ArrivalCinematic; F.bCoreSpawned = I > (int32)EState::CoreSpawn; F.bFirstObjectiveDone = I > (int32)EState::FirstObjective;
		F.bTavianIntroduced = I > (int32)EState::TavianDialogue; F.bBartenderHandoff = I > (int32)EState::BartenderHandoff;
		if (S == EState::FirstMission) F.FirstQuestStatus = EMRQuestStatus::Offered;
		if (S == EState::FreeExplore) { F.FirstQuestStatus = EMRQuestStatus::Active; F.bOnboardingCompleted = true; }
		if (F.bAvatarConfirmed) { R.AvatarRef.AvatarId = FGuid::NewGuid(); R.AvatarRef.Revision = 2; }
		if (F.bCoreSpawned) { R.LastSafeSpawn.MapId = CoreLoc; R.LastSafeSpawn.SpawnPointId = FName("TEST_FIXTURE_NONCANON_SPAWN"); }
		return R;
	}

	void WriteV1(bool bB, const FMRProgressRecord& R, int32 Gen, int32 Version = 1)
	{
		UMRProgressSaveGame* S = NewObject<UMRProgressSaveGame>(GetTransientPackage()); S->SaveVersion = Version; S->WriteGeneration = Gen; S->Record = R; S->Checksum = FMRProgressStore::ComputeChecksum(Gen, R);
		FMRProgressStore::WriteSlotForTest(bB, S);
	}
	void WriteGarbage(bool bB) { TArray<uint8> G; for (int32 I = 0; I < 300; ++I) G.Add((uint8)(I * 37 + 11)); FFileHelper::SaveArrayToFile(G, *FMRProgressStore::SlotFilePath(bB)); }

	FMRMigrationContext NoEvidence() { return FMRMigrationContext(); }
	FMRMigrationContext TavianEvidence(bool bCompleted, bool bMapIds = true, bool bAvail = true)
	{
		FMRMigrationContext C; C.Narrative.bAvailable = bAvail; if (bMapIds) { C.Map.TavianDialogueIds = { TavianDlg }; C.Map.TavianEncounterEffectIds = { TavianFx1, TavianFx2 }; }
		if (bCompleted) C.Narrative.CompletedDialogues.Add(TavianDlg);
		return C;
	}

	// invariants every migration result must satisfy, for ANY input (empty string = OK)
	FString CheckInv(const FMRProgressRecord& V1, const FMRMigrationContext& C, const FMRMigrationResult& R, const FString& V1Before)
	{
		if (!R.bOk) return TEXT("not ok");
		const FMRCheckpointV2& O = R.Record; const bool bE = R.Case == EMRMigrationCase::E_CompletedGrandfathered;
		const TArray<FString> P = O.Validate(); if (P.Num()) return TEXT("invalid v2 output: ") + P[0];
		if (O.bStationEntered || O.bDepartureReached || O.bTransitSeen || O.bTransitSkippedUnavailable || O.bCoreArrived) return TEXT("claims a station/departure/transit/arrival step");
		if (bE) { if (!(O.bOnboardingCompleted && O.bLegacyCompleted && O.PassportScanResult == EMRPassportScanResult::LegacyGrandfathered && O.TravelAuthorization == EMRTravelAuthorization::LegacyGrandfathered && O.LegacyOrigin == EMRLegacyOrigin::V1Completed)) return TEXT("legacy-completed marker incomplete"); }
		else if (O.bOnboardingCompleted || O.bLegacyCompleted || O.PassportScanResult != EMRPassportScanResult::NotScanned || O.TravelAuthorization != EMRTravelAuthorization::NotAuthorized) return TEXT("claims completion/scan/authorization outside case E");
		if ((O.bTavernReached || O.bTavianEncounterStarted || O.bTavianEncounterDone) && R.Case != EMRMigrationCase::D1_TavianEvidence) return TEXT("tavern/encounter flags without evidence");
		if (R.Case == EMRMigrationCase::F_Fallback && (O.LegacyOrigin != EMRLegacyOrigin::V1Fallback || O.bOnboardingCompleted)) return TEXT("fallback must be marked and never completed");
		if (!O.LegacyV1.bPresent || !(O.LegacyV1.Flags == V1.Flags) || O.LegacyV1.State != V1.CurrentState) return TEXT("legacy snapshot missing/different");
		if (V1.LocalProfileId.IsValid() && O.LocalProfileId != V1.LocalProfileId) return TEXT("profile id changed");
		if (!(O.Content == V1.Content)) return TEXT("content versions changed");
		if (O.bIdentityResolved && !(V1.Flags.bPassportChecked && V1.Flags.bAccessResolved)) return TEXT("identity claimed without v1 identity");
		if (O.bAvatarConfirmed && !(V1.Flags.bAvatarConfirmed && O.AvatarRef == V1.AvatarRef)) return TEXT("avatar claimed/changed");
		if (O.CurrentState != MROnboardingV2::StateId(MROnboardingV2::FirstIncompleteState(O))) return TEXT("current state is not the first incomplete state");
		if (O.SafeSpawns.Num() && !(bE && !C.Map.ApprovedCoreLocationId.IsNone() && V1.LastSafeSpawn.MapId == C.Map.ApprovedCoreLocationId)) return TEXT("a safe spawn was assigned without an approved location id");
		if (V1.ToCanonicalString() != V1Before) return TEXT("the v1 input was mutated");
		const FMRMigrationResult R2 = MROnboardingV2::MigrateV1ToV2(V1, C);
		if (!(R2.Record == O) || R2.Case != R.Case) return TEXT("not deterministic");
		return FString();
	}
}

// ---------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_Schema, "MoonRacer.CheckpointV2.Schema.RecordSeparationAndValidation", TestFlags)
bool FMRV2_Schema::RunTest(const FString&)
{
	FMRCheckpointV2 N = FMRCheckpointV2::MakeNew();
	TestTrue(TEXT("a new record validates"), N.Validate().Num() == 0 && N.CurrentState == FName("START"));
	TestTrue(TEXT("v2 has its own 12-state names, separate from v1's 11"), (int32)EMROnboardingStateV2::Count == 12 && (int32)EMROnboardingState::Count == 11 && MROnboardingV2::StateId(EMROnboardingStateV2::IdentityCheck) == FName("IDENTITY_CHECK") && MROnboardingV2::StateId(EMROnboardingStateV2::PassportScan) == FName("PASSPORT_SCAN"));
	EMROnboardingStateV2 S; TestTrue(TEXT("state names parse case-sensitively"), MROnboardingV2::ParseState(FName("STATION_ENTRY"), S) && S == EMROnboardingStateV2::StationEntry && !MROnboardingV2::ParseState(FName("PASSPORT_CHECK"), S));

	// launch identity and the physical scan are SEPARATE
	FMRCheckpointV2 R = N; R.bAccessResolved = true; R.bIdentityResolved = true;
	TestTrue(TEXT("launch identity can be resolved with NO scan"), R.Validate().Num() == 0 && R.PassportScanResult == EMRPassportScanResult::NotScanned);
	FMRCheckpointV2 X = R; X.PassportScanResult = EMRPassportScanResult::OfflineGuestSimulated; TestTrue(TEXT("a scan without reaching the departure terminal is invalid"), X.Validate().Num() > 0);
	X = R; X.TravelAuthorization = EMRTravelAuthorization::Authorized; TestTrue(TEXT("travel authorization without a recorded scan is invalid"), X.Validate().Num() > 0);
	X = R; X.PassportScanResult = EMRPassportScanResult::LegacyGrandfathered; X.TravelAuthorization = EMRTravelAuthorization::LegacyGrandfathered; TestTrue(TEXT("a grandfathered scan is invalid for a non-legacy record"), X.Validate().Num() > 0);
	X = R; X.bIdentityResolved = false; X.bAvatarConfirmed = true; X.AvatarRef.AvatarId = FGuid::NewGuid(); TestTrue(TEXT("ordering: avatar before identity is invalid"), X.Validate().Num() > 0);
	X = R; X.bTransitSeen = true; X.bTransitSkippedUnavailable = true; TestTrue(TEXT("transit cannot be both seen and skipped"), X.Validate().Num() > 0);
	X = R; X.OpaqueSubjectId = TEXT("x"); TestTrue(TEXT("no server identity"), X.Validate().Num() > 0);
	X = R; X.SafeSpawns = { { FName("L1"), FName("S1") }, { FName("L1"), FName("S2") } }; TestTrue(TEXT("one safe spawn per location"), X.Validate().Num() > 0);
	X = R; X.SafeSpawns = { { FName("L1"), FName("S1") }, { FName("L2"), FName("S2") } }; TestTrue(TEXT("per-location safe spawns are allowed"), X.Validate().Num() == 0 && X.FindSafeSpawn(FName("L2")) && X.FindSafeSpawn(FName("L2"))->SpawnPointId == FName("S2") && !X.FindSafeSpawn(FName("L3")));

	// a complete native chain is valid; breaking any link is not
	FMRCheckpointV2 Full = R; Full.bAvatarConfirmed = true; Full.AvatarRef.AvatarId = FGuid::NewGuid(); Full.AvatarRef.Revision = 1;
	Full.bStationEntered = Full.bTavernReached = Full.bTavianEncounterStarted = Full.bTavianEncounterDone = Full.bDepartureReached = true;
	Full.PassportScanResult = EMRPassportScanResult::OfflineGuestSimulated; Full.TravelAuthorization = EMRTravelAuthorization::Authorized; Full.bTransitSkippedUnavailable = true; Full.bCoreArrived = true;
	Full.SafeSpawns = { { FName("TEST_FIXTURE_LOC_CORE"), FName("TEST_FIXTURE_SPAWN_CORE") } }; Full.bOnboardingCompleted = true; Full.CurrentState = FName("FREE_EXPLORE");
	TestTrue(TEXT("a complete station->scan->transit->arrival chain is valid"), Full.Validate().Num() == 0);
	{ FMRCheckpointV2 Y = Full; Y.PassportScanResult = EMRPassportScanResult::NotScanned; TestTrue(TEXT("completion without a scan is invalid"), Y.Validate().Num() > 0); }
	{ FMRCheckpointV2 Y = Full; Y.bCoreArrived = false; TestTrue(TEXT("completion without arrival is invalid"), Y.Validate().Num() > 0); }
	{ FMRCheckpointV2 Y = Full; Y.SafeSpawns.Empty(); TestTrue(TEXT("completion without a safe spawn is invalid"), Y.Validate().Num() > 0); }
	{ FMRCheckpointV2 Y = Full; Y.bOnboardingCompleted = false; TestTrue(TEXT("FREE_EXPLORE without completion is invalid"), Y.Validate().Num() > 0); }
	TestTrue(TEXT("first incomplete state is pure and correct"), MROnboardingV2::FirstIncompleteState(N) == EMROnboardingStateV2::AccessCheck && MROnboardingV2::FirstIncompleteState(R) == EMROnboardingStateV2::AvatarCheck && MROnboardingV2::FirstIncompleteState(Full) == EMROnboardingStateV2::FreeExplore);

	// every field survives the real SaveGame serialisation (catches a missing SaveGame property)
	FMRCheckpointV2 K = Full; K.bLegacyCompleted = false; K.LegacyOrigin = EMRLegacyOrigin::V1Mapped; K.LegacyV1.bPresent = true; K.LegacyV1.State = FName("TAVIAN_DIALOGUE"); K.LegacyV1.Flags.bTavianIntroduced = true; K.LegacyV1.Flags.FirstQuestStatus = EMRQuestStatus::Active;
	K.LegacyV1.LastSafeSpawn.MapId = FName("M"); K.LegacyV1.LastSafeSpawn.SpawnPointId = FName("P"); K.LegacyV1.AvatarRef.AvatarId = FGuid::NewGuid(); K.LegacyV1.AvatarRef.Revision = 9; K.LegacyV1.LocalProfileId = FGuid::NewGuid();
	K.LegacyV1.Content.DialogueVersion = FName("DV"); K.Content.QuestRegistryVersion = FName("QV"); K.Content.CoreManifestVersion = FName("CV"); K.Content.DialogueVersion = FName("DV2");
	UMRProgressSaveGameV2* Obj = NewObject<UMRProgressSaveGameV2>(GetTransientPackage()); Obj->RecordV2 = K; Obj->WriteGeneration = 7; Obj->Checksum2 = MROnboardingV2::ComputeChecksum(7, K);
	TArray<uint8> Mem; TestTrue(TEXT("serialises"), UGameplayStatics::SaveGameToMemory(Obj, Mem));
	UMRProgressSaveGameV2* Back = Cast<UMRProgressSaveGameV2>(UGameplayStatics::LoadGameFromMemory(Mem));
	TestTrue(TEXT("a v2 save round-trips every field (canonical form identical)"), Back && Back->RecordV2.ToCanonicalString() == K.ToCanonicalString() && Back->SaveVersion == 2 && Back->Checksum2 == Obj->Checksum2);
	TestTrue(TEXT("the v2 object IS-A v1 save object (so a v1 reader sees version 2 as NEWER)"), Cast<UMRProgressSaveGame>(Obj) != nullptr && Obj->SaveVersion > MROnboarding::CurrentProgressVersion);
	TestTrue(TEXT("the live v1 version constant is unchanged"), MROnboarding::CurrentProgressVersion == 1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_States, "MoonRacer.CheckpointV2.Migration.EveryLegacyOnboardingState", TestFlags)
bool FMRV2_States::RunTest(const FString&)
{
	struct FExp { EState S; EMRMigrationCase C; EMROnboardingStateV2 Resume; };
	const TArray<FExp> Exp = {
		{ EState::Start, EMRMigrationCase::A_BeforeAvatar, EMROnboardingStateV2::AccessCheck },
		{ EState::AccessCheck, EMRMigrationCase::A_BeforeAvatar, EMROnboardingStateV2::AccessCheck },       // the player is AT the access step: not done yet
		{ EState::PassportCheck, EMRMigrationCase::A_BeforeAvatar, EMROnboardingStateV2::IdentityCheck },
		{ EState::AvatarCheck, EMRMigrationCase::A_BeforeAvatar, EMROnboardingStateV2::AvatarCheck },
		{ EState::ArrivalCinematic, EMRMigrationCase::B_AvatarOnly, EMROnboardingStateV2::StationEntry },
		{ EState::CoreSpawn, EMRMigrationCase::B_AvatarOnly, EMROnboardingStateV2::StationEntry },
		{ EState::FirstObjective, EMRMigrationCase::C_CoreSpawned, EMROnboardingStateV2::StationEntry },
		{ EState::TavianDialogue, EMRMigrationCase::D2_TavianNoEvidence, EMROnboardingStateV2::StationEntry },   // interrupted/not completed
		{ EState::BartenderHandoff, EMRMigrationCase::D2_TavianNoEvidence, EMROnboardingStateV2::StationEntry },
		{ EState::FirstMission, EMRMigrationCase::D2_TavianNoEvidence, EMROnboardingStateV2::StationEntry },
		{ EState::FreeExplore, EMRMigrationCase::E_CompletedGrandfathered, EMROnboardingStateV2::FreeExplore },
	};
	TestEqual(TEXT("all 11 legacy states are covered"), Exp.Num(), (int32)EState::Count);
	for (const FExp& E : Exp)
	{
		const FMRProgressRecord V1 = V1At(E.S); const FString Lbl = MROnboarding::StateId(E.S).ToString();
		TestTrue(Lbl + TEXT(": the fixture v1 record is itself consistent"), V1.Validate().Num() == 0);
		const FString Before = V1.ToCanonicalString(); const FMRMigrationResult R = MROnboardingV2::MigrateV1ToV2(V1, NoEvidence());
		const FString Inv = CheckInv(V1, NoEvidence(), R, Before); if (!Inv.IsEmpty()) AddError(Lbl + TEXT(": ") + Inv);
		TestTrue(Lbl + TEXT(": case"), R.Case == E.C);
		TestTrue(Lbl + TEXT(": resume state"), MROnboardingV2::FirstIncompleteState(R.Record) == E.Resume && R.Record.CurrentState == MROnboardingV2::StateId(E.Resume));
		TestTrue(Lbl + TEXT(": legacy origin recorded"), R.Record.LegacyOrigin == (E.C == EMRMigrationCase::E_CompletedGrandfathered ? EMRLegacyOrigin::V1Completed : EMRLegacyOrigin::V1Mapped));
		TestTrue(Lbl + TEXT(": has explanatory notes where progress is not carried"), E.S < EState::ArrivalCinematic || R.Notes.Num() > 0);
		// identity + avatar facts are preserved
		TestTrue(Lbl + TEXT(": identity and avatar preserved"), R.Record.bAccessResolved == V1.Flags.bAccessResolved && R.Record.bIdentityResolved == (V1.Flags.bPassportChecked && V1.Flags.bAccessResolved) && R.Record.bAvatarConfirmed == V1.Flags.bAvatarConfirmed && (!V1.Flags.bAvatarConfirmed || R.Record.AvatarRef == V1.AvatarRef));
	}
	// the v1 Core safe spawn is never turned into a v2 safe spawn without an approved location id
	const FMRMigrationResult C = MROnboardingV2::MigrateV1ToV2(V1At(EState::FirstObjective), NoEvidence());
	TestTrue(TEXT("a v1 Core safe spawn stays in the legacy snapshot only"), C.Record.SafeSpawns.Num() == 0 && C.Record.LegacyV1.LastSafeSpawn.MapId == CoreLoc);
	// the v1 arrival-cinematic outcome is not treated as the new transit
	const FMRMigrationResult B = MROnboardingV2::MigrateV1ToV2(V1At(EState::CoreSpawn), NoEvidence());
	TestTrue(TEXT("v1 arrival cinematic is not the v2 transit"), B.Record.LegacyV1.Flags.bArrivalSeen && !B.Record.bTransitSeen && !B.Record.bTransitSkippedUnavailable);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_Completed, "MoonRacer.CheckpointV2.Migration.CompletedLegacyPlayers", TestFlags)
bool FMRV2_Completed::RunTest(const FString&)
{
	const FMRProgressRecord V1 = V1At(EState::FreeExplore);
	// narrative status variants: migration never touches or depends on them for completed players
	for (EMRQuestStatus Q : { EMRQuestStatus::NotOffered, EMRQuestStatus::Offered, EMRQuestStatus::Active, EMRQuestStatus::Completed })
	{
		FMRMigrationContext C; C.Narrative.bAvailable = true; C.Narrative.Missions.Add(FName("TEST_FIXTURE_MISSION"), Q); C.Narrative.FiredEffects = { TavianFx1 }; C.Narrative.CompletedDialogues = { TavianDlg };
		const FMRNarrativeEvidence Before = C.Narrative; const FString B = V1.ToCanonicalString();
		const FMRMigrationResult R = MROnboardingV2::MigrateV1ToV2(V1, C);
		const FString Inv = CheckInv(V1, C, R, B); if (!Inv.IsEmpty()) AddError(Inv);
		TestTrue(FString::Printf(TEXT("completed + mission status %d: grandfathered, completed preserved"), (int32)Q), R.Case == EMRMigrationCase::E_CompletedGrandfathered && R.Record.bOnboardingCompleted && R.Record.CurrentState == FName("FREE_EXPLORE"));
		TestTrue(TEXT("the narrative evidence was not modified (mission progress and one-time ledger intact)"), C.Narrative.Missions.FindRef(FName("TEST_FIXTURE_MISSION")) == Q && C.Narrative.FiredEffects.Num() == Before.FiredEffects.Num() && C.Narrative.CompletedDialogues.Num() == 1);
	}
	const FMRMigrationResult R = MROnboardingV2::MigrateV1ToV2(V1, NoEvidence());
	TestTrue(TEXT("explicit legacy-completion status (not a scan, not an arrival)"), R.Record.bLegacyCompleted && R.Record.LegacyOrigin == EMRLegacyOrigin::V1Completed && R.Record.PassportScanResult == EMRPassportScanResult::LegacyGrandfathered && !R.Record.bCoreArrived && !R.Record.bStationEntered && !R.Record.bTransitSeen);
	TestTrue(TEXT("works with no narrative save at all"), R.bOk && R.Record.bOnboardingCompleted);
	// Core safe spawn only with an approved matching id
	FMRMigrationContext Match; Match.Map.ApprovedCoreLocationId = CoreLoc;
	const FMRMigrationResult M = MROnboardingV2::MigrateV1ToV2(V1, Match);
	TestTrue(TEXT("a matching approved Core location id carries the Core safe spawn"), M.Record.SafeSpawns.Num() == 1 && M.Record.SafeSpawns[0].LocationId == CoreLoc && M.Record.Validate().Num() == 0);
	FMRMigrationContext Other; Other.Map.ApprovedCoreLocationId = FName("TEST_FIXTURE_OTHER_LOCATION");
	TestTrue(TEXT("a non-matching approved id does not"), MROnboardingV2::MigrateV1ToV2(V1, Other).Record.SafeSpawns.Num() == 0);
	// completed player whose avatar save is gone: completion preserved
	FMRMigrationContext NoAv; NoAv.Avatar.bChecked = true; NoAv.Avatar.bValid = false;
	const FMRMigrationResult NA = MROnboardingV2::MigrateV1ToV2(V1, NoAv);
	TestTrue(TEXT("a completed player is never un-completed because the avatar save is missing"), NA.Record.bOnboardingCompleted && !NA.Record.bAvatarConfirmed && NA.Notes.ContainsByPredicate([](const FString& S) { return S.Contains(TEXT("avatar")); }));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_Tavian, "MoonRacer.CheckpointV2.Migration.TavianEvidenceAndInterruptedDialogue", TestFlags)
bool FMRV2_Tavian::RunTest(const FString&)
{
	for (EState S : { EState::BartenderHandoff, EState::FirstMission })
	{
		const FMRProgressRecord V1 = V1At(S); const FString L = MROnboarding::StateId(S).ToString(); const FString B = V1.ToCanonicalString();
		{ const FMRMigrationContext C = TavianEvidence(true); const FMRMigrationResult R = MROnboardingV2::MigrateV1ToV2(V1, C); const FString I = CheckInv(V1, C, R, B); if (!I.IsEmpty()) AddError(L + TEXT(": ") + I);
		  TestTrue(L + TEXT(" + approved-dialogue evidence: D1, encounter progress carried"), R.Case == EMRMigrationCase::D1_TavianEvidence && R.Record.bTavernReached && R.Record.bTavianEncounterStarted && R.Record.bTavianEncounterDone);
		  TestTrue(L + TEXT(": the station is NOT claimed; resume at STATION_ENTRY, nothing replayed"), !R.Record.bStationEntered && MROnboardingV2::FirstIncompleteState(R.Record) == EMROnboardingStateV2::StationEntry && R.Record.Validate().Num() == 0);
		  TestTrue(L + TEXT(": after the station the next step would be the departure approach"), [&] { FMRCheckpointV2 X = R.Record; X.bAvatarConfirmed = true; X.bStationEntered = true; return MROnboardingV2::FirstIncompleteState(X) == EMROnboardingStateV2::DepartureApproach && X.Validate().Num() == 0; }()); }
		{ const FMRMigrationContext C = TavianEvidence(false); const FMRMigrationResult R = MROnboardingV2::MigrateV1ToV2(V1, C); TestTrue(L + TEXT(" + narrative save WITHOUT the dialogue: D2, not carried"), R.Case == EMRMigrationCase::D2_TavianNoEvidence && !R.Record.bTavianEncounterDone && !R.Record.bTavernReached); }
		{ const FMRMigrationContext C = TavianEvidence(true, true, false); const FMRMigrationResult R = MROnboardingV2::MigrateV1ToV2(V1, C); TestTrue(L + TEXT(" + narrative save UNAVAILABLE: conservative D2"), R.Case == EMRMigrationCase::D2_TavianNoEvidence && !R.Record.bTavianEncounterDone); }
		{ const FMRMigrationContext C = TavianEvidence(true, false); const FMRMigrationResult R = MROnboardingV2::MigrateV1ToV2(V1, C); TestTrue(L + TEXT(" + no APPROVED dialogue ids exist yet: conservative D2"), R.Case == EMRMigrationCase::D2_TavianNoEvidence && R.Notes.ContainsByPredicate([](const FString& S) { return S.Contains(TEXT("no approved")); })); }
	}
	// the interrupted v1 dialogue: v1 was AT TAVIAN_DIALOGUE (not completed); the narrative save may hold partial one-time effects
	const FMRProgressRecord Int = V1At(EState::TavianDialogue);
	FMRMigrationContext C = TavianEvidence(false); C.Narrative.FiredEffects = { TavianFx1 };
	const FMRMigrationResult R = MROnboardingV2::MigrateV1ToV2(Int, C);
	TestTrue(TEXT("interrupted Tavian dialogue: not carried; restart (D-7); note says effects are not repeated"), R.Case == EMRMigrationCase::D2_TavianNoEvidence && !R.Record.bTavianEncounterDone && R.Notes.ContainsByPredicate([](const FString& S) { return S.Contains(TEXT("interrupted")) && S.Contains(TEXT("NOT repeated")); }));
	TestTrue(TEXT("the one-time ledger evidence was not modified by migration"), C.Narrative.FiredEffects.Num() == 1 && C.Narrative.FiredEffects.Contains(TavianFx1));
	const FMRSaveEvidence Ev{ FMRAvatarEvidence(), C.Narrative, C.Map };
	const FMRConsistencyReport Rep = MROnboardingV2::ReconcileSaves(R.Record, Ev);
	TestTrue(TEXT("reconciliation reports the partial effects as evidence, not as an error"), Rep.Has(TEXT("INTERRUPTED_ENCOUNTER_EFFECTS")) && !Rep.HasConflict());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_Fuzz, "MoonRacer.CheckpointV2.Migration.InvariantsHoldForEveryFlagCombination", TestFlags)
bool FMRV2_Fuzz::RunTest(const FString&)
{
	int32 Runs = 0, Fallbacks = 0, Fail = 0; FString FirstFail;
	const FGuid Avatar = FGuid::NewGuid();
	for (int32 StateIdx = 0; StateIdx <= (int32)EState::Count; ++StateIdx)      // Count = an UNKNOWN state name
	for (int32 Mask = 0; Mask < 1024; ++Mask)
	for (int32 Q = 0; Q < 4; ++Q)
	{
		FMRProgressRecord V = FMRProgressRecord::MakeNew();
		V.CurrentState = StateIdx < (int32)EState::Count ? MROnboarding::StateId((EState)StateIdx) : FName("NOT_A_STATE");
		FMRProgressFlags& F = V.Flags;
		F.bAccessResolved = Mask & 1; F.bPassportChecked = Mask & 2; F.bAvatarConfirmed = Mask & 4; F.bArrivalSeen = Mask & 8; F.bArrivalSkippedUnavailable = Mask & 16;
		F.bCoreSpawned = Mask & 32; F.bFirstObjectiveDone = Mask & 64; F.bTavianIntroduced = Mask & 128; F.bBartenderHandoff = Mask & 256; F.bOnboardingCompleted = Mask & 512; F.FirstQuestStatus = (EMRQuestStatus)Q;
		if (Mask & 4) { V.AvatarRef.AvatarId = Avatar; V.AvatarRef.Revision = 1; }
		if (Mask & 32) { V.LastSafeSpawn.MapId = CoreLoc; V.LastSafeSpawn.SpawnPointId = FName("S"); }
		const int32 Variants = (Mask % 7 == 0) ? 3 : 1;
		for (int32 Var = 0; Var < Variants; ++Var)
		{
			FMRMigrationContext C = Var == 1 ? TavianEvidence(true) : NoEvidence(); if (Var == 2) { C.Avatar.bChecked = true; C.Avatar.bValid = false; C.Map.ApprovedCoreLocationId = CoreLoc; }
			const FString B = V.ToCanonicalString(); const FMRMigrationResult R = MROnboardingV2::MigrateV1ToV2(V, C); ++Runs; Fallbacks += R.Case == EMRMigrationCase::F_Fallback;
			const FString Inv = CheckInv(V, C, R, B); if (!Inv.IsEmpty()) { ++Fail; if (FirstFail.IsEmpty()) FirstFail = FString::Printf(TEXT("state=%d mask=%d q=%d var=%d: %s"), StateIdx, Mask, Q, Var, *Inv); }
		}
	}
	TestEqual(FString::Printf(TEXT("invariants hold for all %d migrations (first failure: %s)"), Runs, *FirstFail), Fail, 0);
	TestTrue(TEXT("invalid/inconsistent inputs took the safe fallback (many of them)"), Fallbacks > 1000);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_SaveObject, "MoonRacer.CheckpointV2.Migration.VersionsAndIdempotence", TestFlags)
bool FMRV2_SaveObject::RunTest(const FString&)
{
	const FMRProgressRecord V1 = V1At(EState::FirstObjective);
	UMRProgressSaveGame* S1 = NewObject<UMRProgressSaveGame>(GetTransientPackage()); S1->SaveVersion = 1; S1->WriteGeneration = 4; S1->Record = V1; S1->Checksum = FMRProgressStore::ComputeChecksum(4, V1);
	const FMRMigrationResult R1 = MROnboardingV2::MigrateSaveObject(S1, NoEvidence());
	TestTrue(TEXT("a v1 save object migrates"), R1.bOk && R1.Case == EMRMigrationCase::C_CoreSpawned);
	TestTrue(TEXT("the SOURCE object is not mutated"), S1->SaveVersion == 1 && S1->Record.ToCanonicalString() == V1.ToCanonicalString());
	const FMRMigrationResult R1b = MROnboardingV2::MigrateSaveObject(S1, NoEvidence());
	TestTrue(TEXT("idempotent: migrating the same source again gives the identical record"), R1b.Record == R1.Record);

	// v0: a legacy stage index that does NOT need an avatar migrates through v0 -> v1 -> v2
	UMRProgressSaveGame* S0 = NewObject<UMRProgressSaveGame>(GetTransientPackage()); S0->SaveVersion = 0; S0->LegacyStageIndex = (int32)EState::AvatarCheck;
	const FMRMigrationResult R0 = MROnboardingV2::MigrateSaveObject(S0, NoEvidence());
	TestTrue(TEXT("v0 chain: v0 -> v1 -> v2"), R0.bOk && R0.Case == EMRMigrationCase::A_BeforeAvatar && R0.Record.bIdentityResolved && !R0.Record.bAvatarConfirmed && S0->SaveVersion == 0);
	// v2 passes through unchanged
	UMRProgressSaveGameV2* S2 = NewObject<UMRProgressSaveGameV2>(GetTransientPackage()); S2->RecordV2 = R1.Record; S2->WriteGeneration = 5; S2->Checksum2 = MROnboardingV2::ComputeChecksum(5, R1.Record);
	const FMRMigrationResult R2 = MROnboardingV2::MigrateSaveObject(S2, NoEvidence());
	TestTrue(TEXT("a v2 save passes through unchanged (idempotent)"), R2.bOk && R2.Record == R1.Record);
	// newer: rejected safely
	UMRProgressSaveGame* S3 = NewObject<UMRProgressSaveGame>(GetTransientPackage()); S3->SaveVersion = 3; S3->Record = V1;
	const FMRMigrationResult R3 = MROnboardingV2::MigrateSaveObject(S3, NoEvidence());
	TestTrue(TEXT("an unsupported NEWER version is rejected safely with a reason"), !R3.bOk && R3.Rejected.Contains(TEXT("newer")) && S3->SaveVersion == 3);
	TestTrue(TEXT("a null save object is rejected, not a crash"), !MROnboardingV2::MigrateSaveObject(nullptr, NoEvidence()).bOk);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_ReadOnly, "MoonRacer.CheckpointV2.Persistence.LoadIsReadOnlyAndPicksTheRightSlot", TestFlags)
bool FMRV2_ReadOnly::RunTest(const FString&)
{
	CleanProgress(); FMRV2LoadReport L;
	const FMRCheckpointV2 Fresh = FMRCheckpointV2Store::Load(NoEvidence(), L);                                                                          // M01
	TestTrue(TEXT("M01 no save: fresh v2 record, nothing created"), L.bFallbackFresh && L.SourceVersion == 0 && Fresh.Validate().Num() == 0 && !Exists(false) && !Exists(true) && NumBackups() == 0);

	for (int32 S = 0; S < (int32)EState::Count; ++S)                                                                                                     // M02-M12 (store level)
	{
		CleanProgress(); const FMRProgressRecord V1 = V1At((EState)S); WriteV1(false, V1, 3);
		const TArray<uint8> Before = Bytes(false);
		const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEvidence(), L);
		const FString Lbl = MROnboarding::StateId((EState)S).ToString();
		TestTrue(Lbl + TEXT(": migrated in memory from the v1 slot"), L.bMigrated && L.SourceVersion == 1 && L.ChosenSlot == TEXT("A") && L.ChosenGeneration == 3 && R.LegacyV1.bPresent && R.Validate().Num() == 0);
		TestTrue(Lbl + TEXT(": the slot file is byte-identical, no backup, no temp file"), Bytes(false) == Before && !Exists(true) && NumBackups() == 0 && !IFileManager::Get().FileExists(*(FMRProgressStore::SlotFilePath(false) + TEXT(".tmp"))));
	}
	{ CleanProgress();                                                                                                                                   // M20 v0
	  UMRProgressSaveGame* O = NewObject<UMRProgressSaveGame>(GetTransientPackage()); O->SaveVersion = 0; O->WriteGeneration = 1; O->LegacyStageIndex = (int32)EState::AvatarCheck; FMRProgressStore::WriteSlotForTest(false, O);
	  const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEvidence(), L);
	  TestTrue(TEXT("M20 v0 slot: v0 -> v1 -> v2 in memory"), L.bMigrated && R.bIdentityResolved && !R.bAvatarConfirmed && NumBackups() == 0);
	  UMRProgressSaveGame* O2 = NewObject<UMRProgressSaveGame>(GetTransientPackage()); O2->SaveVersion = 0; O2->WriteGeneration = 1; O2->LegacyStageIndex = (int32)EState::FirstObjective; FMRProgressStore::WriteSlotForTest(false, O2);
	  const TArray<uint8> B = Bytes(false); const FMRCheckpointV2 R2 = FMRCheckpointV2Store::Load(NoEvidence(), L);
	  TestTrue(TEXT("M20 a v0 stage that never had an avatar reference is rejected by the existing v1 rules: fresh, file preserved"), L.bFallbackFresh && Bytes(false) == B); }
	{ CleanProgress(); WriteV1(false, V1At(EState::AvatarCheck), 1); WriteV1(true, V1At(EState::FirstObjective), 2);                                       // M21
	  const TArray<uint8> A = Bytes(false), B = Bytes(true); const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEvidence(), L);
	  TestTrue(TEXT("M21 both slots v1 with different generations: the newest is migrated, both files untouched"), L.ChosenSlot == TEXT("B") && L.ChosenGeneration == 2 && R.LegacyV1.State == FName("FIRST_OBJECTIVE") && Bytes(false) == A && Bytes(true) == B && NumBackups() == 0); }
	{ CleanProgress(); WriteV1(false, V1At(EState::AvatarCheck), 1); WriteGarbage(true);                                                                   // M22
	  const TArray<uint8> B = Bytes(true); const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEvidence(), L);
	  TestTrue(TEXT("M22 slot A v1 + slot B corrupt: A migrated, the corrupt file preserved untouched, reported"), L.ChosenSlot == TEXT("A") && R.bIdentityResolved && Bytes(true) == B && L.Notes.ContainsByPredicate([](const FString& S) { return S.Contains(TEXT("slot B")); })); }
	{ CleanProgress(); WriteGarbage(false); WriteGarbage(true); const TArray<uint8> A = Bytes(false), B = Bytes(true);
	  const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEvidence(), L);
	  TestTrue(TEXT("both slots corrupt: fresh record in memory, both files preserved, no backup"), L.bFallbackFresh && Bytes(false) == A && Bytes(true) == B && NumBackups() == 0 && R.Validate().Num() == 0); }
	CleanProgress(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_Backups, "MoonRacer.CheckpointV2.Persistence.FirstWriteBacksUpNeverOverwrites", TestFlags)
bool FMRV2_Backups::RunTest(const FString&)
{
	CleanProgress(); FMRV2LoadReport L;
	WriteV1(false, V1At(EState::AvatarCheck), 1); WriteV1(true, V1At(EState::FirstObjective), 2);
	const TArray<uint8> A0 = Bytes(false), B0 = Bytes(true);
	const FMRCheckpointV2 Mig = FMRCheckpointV2Store::Load(NoEvidence(), L);
	TestEqual(TEXT("read-only migration made no backup"), NumBackups(), 0);

	const FMRV2SaveResult S1 = FMRCheckpointV2Store::Save(Mig);
	TestTrue(TEXT("first v2 write succeeds to the ALTERNATE slot (A), generation 3"), S1.bOk && S1.Slot == TEXT("A") && S1.Generation == 3);
	TestTrue(TEXT("BOTH v1 slot files were backed up first, byte-identical"), S1.BackupsCreated.Num() == 2 && NumBackups() == 2 && [&] { TArray<uint8> X, Y; FFileHelper::LoadFileToArray(X, *FMRCheckpointV2Store::BackupPath(false, 0)); FFileHelper::LoadFileToArray(Y, *FMRCheckpointV2Store::BackupPath(true, 0)); return X == A0 && Y == B0; }());
	TestTrue(TEXT("slot B (the latest v1) is still intact and the new v2 is in slot A"), Bytes(true) == B0 && Bytes(false) != A0);
	const FMRCheckpointV2 Back = FMRCheckpointV2Store::Load(NoEvidence(), L);
	TestTrue(TEXT("a reload returns the native v2 record (no migration)"), L.SourceVersion == 2 && !L.bMigrated && Back == Mig && L.ChosenGeneration == 3);

	FMRCheckpointV2 Next = Back; Next.bAccessResolved = Next.bAccessResolved; const FMRV2SaveResult S2 = FMRCheckpointV2Store::Save(Next);
	TestTrue(TEXT("a later v2 write needs no new backup of a file that is already v2 (it replaces the older v1 slot B, which is already backed up)"), S2.bOk && S2.Slot == TEXT("B") && S2.BackupsCreated.Num() == 0 && NumBackups() == 2);
	TestTrue(TEXT("the backups still hold the ORIGINAL v1 bytes"), [&] { TArray<uint8> X, Y; FFileHelper::LoadFileToArray(X, *FMRCheckpointV2Store::BackupPath(false, 0)); FFileHelper::LoadFileToArray(Y, *FMRCheckpointV2Store::BackupPath(true, 0)); return X == A0 && Y == B0; }());
	TestTrue(TEXT("generations increase monotonically"), FMRCheckpointV2Store::Save(Next).Generation == 5);

	// never overwrite an existing backup: a DIFFERENT file already at the backup name -> a numbered backup is created
	CleanProgress(); WriteV1(false, V1At(EState::PassportCheck), 1);
	const FString Pre = FMRCheckpointV2Store::BackupPath(false, 0); const TArray<uint8> Marker = { 1, 2, 3, 4, 5 }; FFileHelper::SaveArrayToFile(Marker, *Pre);
	const TArray<uint8> V1Bytes = Bytes(false); const FMRV2SaveResult S3 = FMRCheckpointV2Store::Save(FMRCheckpointV2Store::Load(NoEvidence(), L));
	TArray<uint8> PreAfter; FFileHelper::LoadFileToArray(PreAfter, *Pre); TArray<uint8> Num1; FFileHelper::LoadFileToArray(Num1, *FMRCheckpointV2Store::BackupPath(false, 1));
	TestTrue(TEXT("an existing (different) backup is NEVER overwritten; the v1 file goes to a numbered backup"), S3.bOk && PreAfter == Marker && Num1 == V1Bytes);
	// an identical backup already present: no duplicate
	CleanProgress(); WriteV1(false, V1At(EState::PassportCheck), 1); IFileManager::Get().Copy(*FMRCheckpointV2Store::BackupPath(false, 0), *FMRProgressStore::SlotFilePath(false));
	const FMRV2SaveResult S4 = FMRCheckpointV2Store::Save(FMRCheckpointV2Store::Load(NoEvidence(), L));
	TestTrue(TEXT("an identical backup already exists: reused, no duplicate"), S4.bOk && NumBackups() == 1);
	// nothing to back up
	CleanProgress(); const FMRV2SaveResult S5 = FMRCheckpointV2Store::Save(FMRCheckpointV2::MakeNew());
	TestTrue(TEXT("a brand-new player's first save needs no backups"), S5.bOk && S5.BackupsCreated.Num() == 0 && NumBackups() == 0);
	// a corrupt slot is also preserved as evidence before the first v2 write
	CleanProgress(); WriteGarbage(false); const TArray<uint8> G = Bytes(false); const FMRV2SaveResult S6 = FMRCheckpointV2Store::Save(FMRCheckpointV2::MakeNew());
	TArray<uint8> GB; FFileHelper::LoadFileToArray(GB, *FMRCheckpointV2Store::BackupPath(false, 0));
	TestTrue(TEXT("a corrupt slot file is preserved as a backup too (evidence is never discarded)"), S6.bOk && GB == G);
	CleanProgress(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_Interrupted, "MoonRacer.CheckpointV2.Persistence.InterruptedWritesLeaveARecoverableCheckpoint", TestFlags)
bool FMRV2_Interrupted::RunTest(const FString&)
{
	using FP = FMRCheckpointV2Store::EFailPoint; FMRV2LoadReport L;
	const FMRProgressRecord RA = V1At(EState::AvatarCheck), RB = V1At(EState::FirstObjective);   // fixed records: byte-identical across setups
	auto Setup = [&]() { CleanProgress(); WriteV1(false, RA, 1); WriteV1(true, RB, 2); };
	Setup(); const FMRCheckpointV2 Expected = FMRCheckpointV2Store::Load(NoEvidence(), L); const TArray<uint8> A0 = Bytes(false), B0 = Bytes(true);

	{ Setup(); FMRCheckpointV2Store::GFailPoint = FP::AfterBackup; const FMRV2SaveResult R = FMRCheckpointV2Store::Save(Expected); FMRCheckpointV2Store::GFailPoint = FP::None;
	  TestTrue(TEXT("interrupted right after the backups: nothing written, both v1 files intact, backups exist"), !R.bOk && Bytes(false) == A0 && Bytes(true) == B0 && NumBackups() == 2);
	  const FMRCheckpointV2 Rec = FMRCheckpointV2Store::Load(NoEvidence(), L); TestTrue(TEXT("and the checkpoint is fully recoverable (same migrated record)"), Rec == Expected && L.SourceVersion == 1);
	  const FMRV2SaveResult Retry = FMRCheckpointV2Store::Save(Expected); TestTrue(TEXT("the retry succeeds and creates NO duplicate backups"), Retry.bOk && NumBackups() == 2); }

	{ Setup(); FMRCheckpointV2Store::GFailPoint = FP::AfterTempWrite; const FMRV2SaveResult R = FMRCheckpointV2Store::Save(Expected); FMRCheckpointV2Store::GFailPoint = FP::None;
	  TestTrue(TEXT("interrupted after the temp write: the real slot files are untouched (a stray .tmp may remain)"), !R.bOk && Bytes(false) == A0 && Bytes(true) == B0);
	  const FMRCheckpointV2 Rec = FMRCheckpointV2Store::Load(NoEvidence(), L); TestTrue(TEXT("recoverable"), Rec == Expected);
	  TestTrue(TEXT("the retry replaces the stray temp file and succeeds"), FMRCheckpointV2Store::Save(Expected).bOk && ([&]() { FMRCheckpointV2Store::Load(NoEvidence(), L); return L.SourceVersion == 2; }())); }

	{ Setup(); FMRCheckpointV2Store::GFailPoint = FP::TornTargetWrite; const FMRV2SaveResult R = FMRCheckpointV2Store::Save(Expected); FMRCheckpointV2Store::GFailPoint = FP::None;
	  TestTrue(TEXT("a TORN write into the target slot is reported"), !R.bOk);
	  TestTrue(TEXT("the latest valid checkpoint (slot B) is intact"), Bytes(true) == B0);
	  const FMRCheckpointV2 Rec = FMRCheckpointV2Store::Load(NoEvidence(), L);
	  TestTrue(TEXT("the checkpoint is recovered from the latest valid slot; the torn file is reported and preserved"), Rec == Expected && L.ChosenSlot == TEXT("B") && L.Notes.ContainsByPredicate([](const FString& S) { return S.Contains(TEXT("slot A")); }));
	  const FMRV2SaveResult Retry = FMRCheckpointV2Store::Save(Expected);
	  TestTrue(TEXT("a later save recovers: the torn slot is backed up as evidence, then replaced"), Retry.bOk && ([&]() { FMRCheckpointV2Store::Load(NoEvidence(), L); return L.SourceVersion == 2; }()) && NumBackups() >= 2); }
	CleanProgress(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_Versions, "MoonRacer.CheckpointV2.Persistence.MixedAndNewerVersions", TestFlags)
bool FMRV2_Versions::RunTest(const FString&)
{
	FMRV2LoadReport L; const FMRCheckpointV2 Mig = MROnboardingV2::MigrateV1ToV2(V1At(EState::CoreSpawn), NoEvidence()).Record;
	{ CleanProgress(); WriteV1(true, V1At(EState::AvatarCheck), 2); FMRCheckpointV2Store::WriteSlotV2ForTest(false, 3, Mig);                                         // M23
	  const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEvidence(), L); TestTrue(TEXT("M23 slot A v2 (newer) + slot B v1: v2 wins, no migration, no write"), L.SourceVersion == 2 && L.ChosenSlot == TEXT("A") && !L.bMigrated && R == Mig && NumBackups() == 0); }
	{ CleanProgress(); FMRCheckpointV2Store::WriteSlotV2ForTest(false, 2, Mig); WriteV1(true, V1At(EState::FirstObjective), 5);
	  const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEvidence(), L); TestTrue(TEXT("P5B-3B: a v1 slot with a HIGHER generation does NOT discard valid v2 progress: v2 is used, the conflict is reported, both files untouched"), L.SourceVersion == 2 && L.ChosenSlot == TEXT("A") && !L.bMigrated && L.bMixedConflict && L.AlternateMigration.bOk && NumBackups() == 0); }
	{ CleanProgress(); WriteV1(false, V1At(EState::AvatarCheck), 1, /*Version*/ 3); WriteV1(true, V1At(EState::FirstObjective), 2);                                    // M24
	  const TArray<uint8> A = Bytes(false), B = Bytes(true); const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEvidence(), L);
	  TestTrue(TEXT("M24 slot A holds a version-3 save: never loaded; slot B migrated; both untouched"), L.bNewerA && L.bRejectedNewerVersion && L.ChosenSlot == TEXT("B") && L.bMigrated && Bytes(false) == A && Bytes(true) == B);
	  const FMRV2SaveResult S = FMRCheckpointV2Store::Save(R);
	  TestTrue(TEXT("saving refuses to overwrite the newer-version slot (and writes nothing, backs nothing up)"), !S.bOk && S.Error.Contains(TEXT("newer")) && Bytes(false) == A && Bytes(true) == B && NumBackups() == 0); }
	{ CleanProgress(); WriteV1(false, V1At(EState::AvatarCheck), 1, 3); WriteV1(true, V1At(EState::AvatarCheck), 2, 4);
	  const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEvidence(), L); TestTrue(TEXT("both slots newer-version: fresh in memory, nothing modified"), L.bFallbackFresh && L.bRejectedNewerVersion && !FMRCheckpointV2Store::Save(R).bOk); }
	// the LIVE v1 store (this build) treats a v2 file as a newer version: it never loads it as v1 and never overwrites it
	{ CleanProgress(); FMRCheckpointV2Store::WriteSlotV2ForTest(false, 3, Mig); WriteV1(true, V1At(EState::AvatarCheck), 2);
	  const TArray<uint8> A = Bytes(false); FMRProgressLoadReport VL; const FMRProgressRecord Old = FMRProgressStore::Load(VL);
	  TestTrue(TEXT("M31 the v1 store reports the v2 slot as a newer version"), VL.bRejectedNewerVersion && !VL.bValidA);
	  const FMRProgressSaveResult VS = FMRProgressStore::Save(Old);
	  TestTrue(TEXT("M31 the v1 store REFUSES to overwrite the v2 slot (downgrade protection)"), !VS.bOk && VS.Error.Contains(TEXT("newer")) && Bytes(false) == A); }
	CleanProgress(); return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_Consistency, "MoonRacer.CheckpointV2.Consistency.CrossSaveReconciliation", TestFlags)
bool FMRV2_Consistency::RunTest(const FString&)
{
	FMRCheckpointV2 Onb = FMRCheckpointV2::MakeNew(); Onb.bAccessResolved = Onb.bIdentityResolved = Onb.bAvatarConfirmed = true; Onb.AvatarRef.AvatarId = FGuid::NewGuid(); Onb.AvatarRef.Revision = 2;
	Onb.bStationEntered = Onb.bTavernReached = Onb.bTavianEncounterStarted = Onb.bTavianEncounterDone = true; Onb.CurrentState = FName("DEPARTURE_APPROACH");
	TestTrue(TEXT("fixture checkpoint is valid"), Onb.Validate().Num() == 0);
	const FString Before = Onb.ToCanonicalString();
	FMRSaveEvidence Ev; Ev.Map.TavianDialogueIds = { TavianDlg }; Ev.Map.TavianEncounterEffectIds = { TavianFx1, TavianFx2 };
	Ev.Avatar.bChecked = true; Ev.Avatar.bValid = true; Ev.Avatar.AvatarId = Onb.AvatarRef.AvatarId; Ev.Avatar.Revision = 2;
	Ev.Narrative.bAvailable = true; Ev.Narrative.CompletedDialogues = { TavianDlg }; Ev.Narrative.FiredEffects = { TavianFx1, TavianFx2 };
	TestEqual(TEXT("fully consistent saves report nothing"), MROnboardingV2::ReconcileSaves(Onb, Ev).Items.Num(), 0);

	auto Run = [&](TFunction<void(FMRSaveEvidence&)> Mut, const TCHAR* Code, EMRConsistencySeverity Sev) { FMRSaveEvidence E = Ev; Mut(E); const FMRConsistencyReport R = MROnboardingV2::ReconcileSaves(Onb, E); const FMRInconsistency* H = R.Items.FindByPredicate([&](const FMRInconsistency& I) { return I.Code == FName(Code); }); TestTrue(FString(Code) + TEXT(" reported"), H != nullptr && H->Severity == Sev && !H->Message.IsEmpty()); return R; };
	Run([](FMRSaveEvidence& E) { E.Avatar.bValid = false; E.Avatar.bMalformedPreserved = true; }, TEXT("AVATAR_MISSING"), EMRConsistencySeverity::Warning);
	Run([](FMRSaveEvidence& E) { E.Avatar.AvatarId = FGuid::NewGuid(); }, TEXT("AVATAR_REF_MISMATCH"), EMRConsistencySeverity::Info);
	Run([](FMRSaveEvidence& E) { E.Avatar.Revision = 9; }, TEXT("AVATAR_REVISION_DIFFERS"), EMRConsistencySeverity::Info);
	Run([](FMRSaveEvidence& E) { E.Narrative = FMRNarrativeEvidence(); }, TEXT("NARRATIVE_UNAVAILABLE"), EMRConsistencySeverity::Warning);
	{ const FMRConsistencyReport R = Run([](FMRSaveEvidence& E) { E.Narrative.CompletedDialogues.Empty(); }, TEXT("TAVIAN_DONE_WITHOUT_EVIDENCE"), EMRConsistencySeverity::Warning); TestTrue(TEXT("with evidence attached"), R.Items.Last().Evidence.Num() > 0 || R.Items[0].Evidence.Num() > 0); }
	Run([](FMRSaveEvidence& E) { E.Narrative.FiredEffects = { TavianFx1 }; }, TEXT("LEDGER_MISSING_FOR_COMPLETED"), EMRConsistencySeverity::Warning);
	{ FMRCheckpointV2 NotDone = Onb; NotDone.bTavianEncounterDone = false; NotDone.CurrentState = FName("TAVIAN_ENCOUNTER");
	  const FMRConsistencyReport R = MROnboardingV2::ReconcileSaves(NotDone, Ev); TestTrue(TEXT("dialogue completed in the narrative save but not in onboarding: informational, never auto-advanced"), R.Has(TEXT("NARRATIVE_TAVIAN_DONE_ONB_NOT")) && !R.HasConflict() && NotDone.ToCanonicalString() != Before); }
	{ FMRCheckpointV2 Early = FMRCheckpointV2::MakeNew(); Early.bAccessResolved = Early.bIdentityResolved = true; Early.CurrentState = FName("AVATAR_CHECK"); FMRSaveEvidence E = Ev; E.Narrative.Missions.Add(FName("TEST_FIXTURE_MISSION"), EMRQuestStatus::Active);
	  TestTrue(TEXT("mission progress before the encounter is noted, not 'fixed'"), MROnboardingV2::ReconcileSaves(Early, E).Has(TEXT("MISSION_BEFORE_ENCOUNTER"))); }
	{ FMRCheckpointV2 Bad = Onb; Bad.PassportScanResult = EMRPassportScanResult::OfflineGuestSimulated; const FMRConsistencyReport R = MROnboardingV2::ReconcileSaves(Bad, Ev); TestTrue(TEXT("a structurally inconsistent checkpoint is a CONFLICT, kept as-is"), R.HasConflict() && R.Has(TEXT("V2_STRUCTURAL"))); }
	{ FMRMigrationContext NoMap; FMRSaveEvidence E = Ev; E.Map = FMRMigrationMap(); TestTrue(TEXT("no approved dialogue ids: reported as 'cannot cross-check', never as a failure"), MROnboardingV2::ReconcileSaves(Onb, E).Has(TEXT("EVIDENCE_IDS_UNAPPROVED"))); }
	{ const FMRProgressRecord Done = V1At(EState::FreeExplore); const FMRCheckpointV2 Leg = MROnboardingV2::MigrateV1ToV2(Done, NoEvidence()).Record; TestTrue(TEXT("a grandfathered player is reported as such, with no scan/arrival claimed"), MROnboardingV2::ReconcileSaves(Leg, FMRSaveEvidence()).Has(TEXT("LEGACY_GRANDFATHERED_NO_SCAN"))); }
	TestEqual(TEXT("reconciliation never modifies the onboarding record"), Onb.ToCanonicalString(), Before);

	// ---- against the REAL stores (dedicated slots): evidence gathering is read-only
	CleanProgress(); UMRAvatarSaveSubsystem::SetSlotNameOverride(AvatarSlot); FMRNarrativeStore::SetSlotBaseOverride(NarrSlot); FMRNarrativeStore::Delete();
	IFileManager::Get().Delete(*UMRAvatarSaveSubsystem::SlotFilePath(), false, true, true);
	TStrongObjectPtr<UGameInstance> GI(NewObject<UGameInstance>(GetTransientPackage())); TStrongObjectPtr<UMRAvatarSaveSubsystem> Av(NewObject<UMRAvatarSaveSubsystem>(GI.Get()));
	UMRAvatarCatalog* Cat = UMRAvatarCatalog::LoadDefault(); Av->SetCatalogOverride(Cat);
	FMRAvatarAppearance A = Cat->MakeDefaultAppearance(); A.SpeciesId = FName("mythraxian"); A.BodyBaseId = FName("dev_quinn"); A.MaterialVariantId = FName("dev_alt"); A.Revision = 3;
	FString Err; TestTrue(TEXT("a dedicated avatar save exists"), Av->SaveAppearance(A, Err));
	FMRAvatarLoadReport AR; const FMRAvatarAppearance Loaded = Av->LoadAppearance(AR);
	FMRNarrativeState NS; NS.CompletedDialogues.Add(TavianDlg); NS.FiredEffects.Add(TavianFx1); NS.Missions.Add(FName("TEST_FIXTURE_MISSION"), EMRQuestStatus::Active);
	FString NE; TestTrue(TEXT("a dedicated narrative save exists"), FMRNarrativeStore::Save(NS, FName("QV"), FName("DV"), NE));
	TArray<uint8> AvB, NaB; FFileHelper::LoadFileToArray(AvB, *UMRAvatarSaveSubsystem::SlotFilePath()); FFileHelper::LoadFileToArray(NaB, *FMRNarrativeStore::FilePath());
	FMRMigrationMap Map; Map.TavianDialogueIds = { TavianDlg }; Map.TavianEncounterEffectIds = { TavianFx1, TavianFx2 };
	const FMRSaveEvidence RealEv = FMRCheckpointV2Store::GatherSaveEvidence(Av.Get(), Map);
	TestTrue(TEXT("real evidence: avatar valid with its id/revision, narrative available with the dialogue/ledger/mission"), RealEv.Avatar.bChecked && RealEv.Avatar.bValid && RealEv.Avatar.AvatarId == Loaded.AvatarId && RealEv.Avatar.Revision == 3 && RealEv.Narrative.bAvailable && RealEv.Narrative.CompletedDialogues.Contains(TavianDlg) && RealEv.Narrative.FiredEffects.Contains(TavianFx1) && RealEv.Narrative.Missions.FindRef(FName("TEST_FIXTURE_MISSION")) == EMRQuestStatus::Active);
	TArray<uint8> AvB2, NaB2; FFileHelper::LoadFileToArray(AvB2, *UMRAvatarSaveSubsystem::SlotFilePath()); FFileHelper::LoadFileToArray(NaB2, *FMRNarrativeStore::FilePath());
	TestTrue(TEXT("gathering evidence wrote nothing (avatar and narrative saves byte-identical)"), AvB == AvB2 && NaB == NaB2);
	// a v1 completed-with-Tavian record migrated against the REAL evidence
	FMRProgressRecord V1 = V1At(EState::BartenderHandoff); V1.AvatarRef.AvatarId = Loaded.AvatarId; V1.AvatarRef.Revision = 3;
	FMRMigrationContext MC; MC.Avatar = RealEv.Avatar; MC.Narrative = RealEv.Narrative; MC.Map = Map;
	const FMRMigrationResult MR = MROnboardingV2::MigrateV1ToV2(V1, MC);
	TestTrue(TEXT("migration against real saves: D1, avatar verified and carried, narrative untouched"), MR.Case == EMRMigrationCase::D1_TavianEvidence && MR.Record.bAvatarConfirmed && MR.Record.AvatarRef.AvatarId == Loaded.AvatarId);
	// avatar save removed -> contradicted
	Av->DeleteSavedAppearance(); const FMRSaveEvidence NoAv = FMRCheckpointV2Store::GatherSaveEvidence(Av.Get(), Map);
	TestTrue(TEXT("avatar save gone: checked-and-invalid (not silently 'fine')"), NoAv.Avatar.bChecked && !NoAv.Avatar.bValid);
	FMRMigrationContext MC2; MC2.Avatar = NoAv.Avatar; MC2.Narrative = NoAv.Narrative; MC2.Map = Map; const FMRMigrationResult MR2 = MROnboardingV2::MigrateV1ToV2(V1, MC2);
	TestTrue(TEXT("avatar not carried, other progress kept, reported"), !MR2.Record.bAvatarConfirmed && MR2.Record.bTavianEncounterDone && MR2.Notes.ContainsByPredicate([](const FString& S) { return S.Contains(TEXT("avatar")); }) && MR2.Record.Validate().Num() == 0);
	TestTrue(TEXT("and the consistency report names the avatar problem"), MROnboardingV2::ReconcileSaves(MR.Record, FMRSaveEvidence{ NoAv.Avatar, NoAv.Narrative, Map }).Has(TEXT("AVATAR_MISSING")));
	// corrupt narrative save -> unavailable, preserved
	{ TArray<uint8> G; for (int32 I = 0; I < 90; ++I) G.Add((uint8)(I * 13 + 5)); FFileHelper::SaveArrayToFile(G, *FMRNarrativeStore::FilePath());
	  const FMRSaveEvidence Bad = FMRCheckpointV2Store::GatherSaveEvidence(Av.Get(), Map); TArray<uint8> After; FFileHelper::LoadFileToArray(After, *FMRNarrativeStore::FilePath());
	  TestTrue(TEXT("M29 a corrupt narrative save yields 'unavailable' evidence and is preserved untouched"), !Bad.Narrative.bAvailable && After == G); }
	FMRNarrativeStore::Delete(); IFileManager::Get().Delete(*UMRAvatarSaveSubsystem::SlotFilePath(), false, true, true); CleanProgress();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2_Guards, "MoonRacer.CheckpointV2.Isolation.DefaultSlotAndLiveFlowUntouched", TestFlags)
bool FMRV2_Guards::RunTest(const FString&)
{
	const FString Dir = FPaths::ProjectSavedDir() / TEXT("SaveGames");
	FMRProgressStore::SetSlotBaseOverride(FMRCheckpointV2Store::DefaultSlotBase());
	const FMRV2SaveResult R = FMRCheckpointV2Store::Save(FMRCheckpointV2::MakeNew());
	TestTrue(TEXT("M32 v2 persistence refuses the default player slot"), !R.bOk && R.Error.Contains(TEXT("default")));
	for (const TCHAR* N : { TEXT("MRProgress_Local_A.sav"), TEXT("MRProgress_Local_B.sav"), TEXT("MRAvatar_Local.sav"), TEXT("MRNarrative_Local.sav") })
		TestFalse(FString(N) + TEXT(" was not created"), IFileManager::Get().FileExists(*(Dir / N)));
	CleanProgress();
	TestTrue(TEXT("the test slot is dedicated"), FMRProgressStore::SlotBase() == Base);
	// the live flow is unchanged: v1 constants/spine/state names are exactly as before; v2 is a separate type with no machine
	TestTrue(TEXT("the 11-state v1 spine, its names and version are unchanged"), (int32)EState::Count == 11 && MROnboarding::StateId(EState::PassportCheck) == FName("PASSPORT_CHECK") && MROnboarding::Spine().Num() == 11 && MROnboarding::CurrentProgressVersion == 1);
	TestTrue(TEXT("v1 records and the v1 store round-trip exactly as before"), [&] { CleanProgress(); const FMRProgressRecord V = V1At(EState::FirstObjective); const FMRProgressSaveResult S = FMRProgressStore::Save(V); FMRProgressLoadReport LR; const FMRProgressRecord B = FMRProgressStore::Load(LR); const bool bOk = S.bOk && B == V && !LR.bMigrated; CleanProgress(); return bOk; }());
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
