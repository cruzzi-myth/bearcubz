// Moon Racer - v2 onboarding STATE MACHINE tests (Phase 3B P5B-3B). Run:
//   UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer.OnboardingV2; Quit" -unattended -nullrhi -nosplash -nosound
// Everything is TEST FIXTURE - NONCANON. Dedicated slots ONLY (MRProgress_V2MachineTest, MRNarrative_V2MachineTest, MRAvatar_V2MachineTest); the default
// player slots are never touched. The v2 development flag is switched on through a test override, never through the real command line.
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Avatar/MRAvatarSaveGame.h"
#include "Dev/MRNarrativeFixtures.h"
#include "Engine/GameInstance.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Narrative/MRDialogueRuntime.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "Onboarding/MRCheckpointV2Store.h"
#include "Onboarding/MRDevOnboardingServices.h"
#include "Onboarding/MROnboardingV2Machine.h"
#include "Onboarding/MROnboardingV2Subsystem.h"
#include "UObject/StrongObjectPtr.h"

// File-local test code lives in a uniquely named namespace so that unity builds (which merge .cpp files)
// cannot see helpers such as TestFlags/TestSlot/Good from other test files.
namespace MROnboardingV2MachineTestUnit
{
namespace
{
	constexpr EAutomationTestFlags TestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;
	const TCHAR* Base = TEXT("MRProgress_V2MachineTest");
	const TCHAR* NarrSlot = TEXT("MRNarrative_V2MachineTest");
	const TCHAR* AvatarSlot = TEXT("MRAvatar_V2MachineTest");
	using EState = EMROnboardingStateV2;
	using EEv = EMRV2Event;
	using namespace MRNarrativeFixtures;

	void CleanProgress()
	{
		FMRProgressStore::SetSlotBaseOverride(Base); FMRProgressStore::DeleteBoth();
		for (bool bB : { false, true })
		{
			for (const FString& P : FMRCheckpointV2Store::ListBackups(bB)) IFileManager::Get().Delete(*P, false, true, true);
			IFileManager::Get().Delete(*(FMRProgressStore::SlotFilePath(bB) + TEXT(".tmp")), false, true, true);
		}
		FMRCheckpointV2Store::GFailPoint = FMRCheckpointV2Store::EFailPoint::None;
	}
	void Setup()
	{
		MROnboardingV2Dev::SetFlagOverrideForTest(1); MROnboardingV2Dev::SetSimulateShippingForTest(false);
		CleanProgress();
		FMRNarrativeStore::SetSlotBaseOverride(NarrSlot); FMRNarrativeStore::Delete();
		UMRAvatarSaveSubsystem::SetSlotNameOverride(AvatarSlot);
	}
	void TearDown() { CleanProgress(); FMRNarrativeStore::SetSlotBaseOverride(NarrSlot); FMRNarrativeStore::Delete(); MROnboardingV2Dev::SetFlagOverrideForTest(-1); MROnboardingV2Dev::SetSimulateShippingForTest(false); }
	TArray<uint8> Bytes(bool bB) { TArray<uint8> A; FFileHelper::LoadFileToArray(A, *FMRProgressStore::SlotFilePath(bB)); return A; }
	bool Exists(bool bB) { return IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(bB)); }
	int32 NumBackups() { return FMRCheckpointV2Store::ListBackups(false).Num() + FMRCheckpointV2Store::ListBackups(true).Num(); }
	FMRMigrationContext NoEv() { return FMRMigrationContext(); }

	FMRAvatarRef TestRef() { FMRAvatarRef R; R.AvatarId = FGuid(0x11111111, 0x22222222, 0x33333333, 0x44444444); R.Revision = 3; return R; }

	/** The development rig: a game instance, a machine and the TEST FIXTURE services (objectives are manual: tests reach them). */
	struct FRig
	{
		TStrongObjectPtr<UGameInstance> GI; TStrongObjectPtr<UMROnboardingMachineV2> M; TStrongObjectPtr<UMRNarrativeSubsystem> N; FMRNarrativeBundle Bundle;
		UMRDevV2WorldService* W = nullptr; UMRDevV2SpawnService* Sp = nullptr; UMRDevV2CinematicService* Ci = nullptr; UMRDevPassportScanService* Sc = nullptr;
		UMRDevInteractionService* In = nullptr; UMRDevAvatarFlowService* Av = nullptr; UMRDevV2IdentityService* Id = nullptr; UMRDevDialogueService* Dl = nullptr;
		explicit FRig(bool bManual = false)
		{
			GI.Reset(NewObject<UGameInstance>(GetTransientPackage()));
			M.Reset(NewObject<UMROnboardingMachineV2>(GI.Get())); M->UseDevServices(nullptr); M->bManualDrive = bManual;
			W = Cast<UMRDevV2WorldService>(M->WorldService); Sp = Cast<UMRDevV2SpawnService>(M->SpawnService); Ci = Cast<UMRDevV2CinematicService>(M->CinematicService);
			Sc = Cast<UMRDevPassportScanService>(M->ScanService); In = Cast<UMRDevInteractionService>(M->InteractionService); Av = Cast<UMRDevAvatarFlowService>(M->AvatarService);
			Id = Cast<UMRDevV2IdentityService>(M->IdentityService); Dl = Cast<UMRDevDialogueService>(M->DialogueService);
			Av->ForcedRef = TestRef(); In->bAutoComplete = false;
			M->Content.Departure.bResolved = true; M->Content.Departure.bNoRequirementsByDesign = true;   // synthetic: no requirements unless a test sets some
		}
		UMROnboardingMachineV2* operator->() const { return M.Get(); }
		void Reach() { In->NotifyObjectiveReached(); }
		/** Attach the REAL narrative runtime (fixture bundle). */
		bool Narrative(bool bLoadState = false)
		{
			RegisterStrings();
			N.Reset(NewObject<UMRNarrativeSubsystem>(GI.Get())); N->Setup();
			Bundle = Build(GI.Get()); FMRValidationReport Rep;
			const bool bOk = N->RegisterBundle(Bundle, FMRValidationPolicy(), Rep);
			if (bLoadState) N->LoadState();
			MRNarrative::BindOnboardingV2(M.Get(), N.Get());
			return bOk;
		}
		void ReachNarr(FName Objective) { N->ReachStandaloneObjective(Objective); }
	};

	FMRV2EventPayload Pay(UMROnboardingMachineV2* M, EEv E)
	{
		FMRV2EventPayload P; const FMRV2FixtureContent& C = M->Content;
		switch (E)
		{
		case EEv::AvatarConfirmed: P.AvatarRef = TestRef(); break;
		case EEv::StationEntered: P.UsedSpawnPointId = C.StationSpawn; break;
		case EEv::TavernReached: P.UsedSpawnPointId = C.TavernSpawn; break;
		case EEv::DepartureReached: P.UsedSpawnPointId = C.DepartureSpawn; break;
		case EEv::PassportScanned: P.Scan = EMRPassportScanResult::OfflineGuestSimulated; break;
		case EEv::TransitFinished: P.Cinematic = EMRArrivalOutcome::Played; break;
		case EEv::CoreArrived: P.UsedSpawnPointId = C.CoreSpawn; break;
		default: break;
		}
		return P;
	}
	const EEv Walk[] = { EEv::AccessResolved, EEv::IdentityResolved, EEv::AvatarConfirmed, EEv::StationEntered, EEv::TavernReached, EEv::EncounterDone, EEv::DepartureReached, EEv::PassportScanned, EEv::TransitFinished, EEv::CoreArrived };
	/** Manual machine: send the first N walk events (each must be accepted). */
	bool Advance(FRig& R, int32 N) { for (int32 J = 0; J < N; ++J) if (!R->HandleEvent(Walk[J], Pay(R.M.Get(), Walk[J])).bAccepted) return false; return true; }

	TArray<FString> Transitions(UMROnboardingMachineV2* M)
	{
		TArray<FString> Out; for (const FString& L : M->TransitionLog) { int32 I = L.Find(TEXT(" -> ")); if (I != INDEX_NONE && !L.StartsWith(TEXT("REJECT")) && !L.StartsWith(TEXT("BLOCKED"))) Out.Add(L.Left(L.Find(TEXT(" on ")))); }
		return Out;
	}

	void Drive(UMRNarrativeSubsystem* N, const TArray<FName>& Choices)
	{
		UMRDialogueRuntime* Rt = N->GetRuntime(); int32 Guard = 0, I = 0;
		while (Rt->IsActive() && Guard++ < 30)
		{
			const FMRDialogueView& V = Rt->GetView();
			if (V.bCanContinue) Rt->Continue(); else if (V.Choices.Num()) Rt->Choose(Choices.IsValidIndex(I) ? Choices[I++] : FName("c_no")); else break;
		}
	}

	// a CONSISTENT v1 record exactly as the v1 machine writes it while the player is AT state S
	FMRProgressRecord V1At(EMROnboardingState S)
	{
		using E1 = EMROnboardingState;
		FMRProgressRecord R = FMRProgressRecord::MakeNew(); const int32 I = (int32)S; R.CurrentState = MROnboarding::StateId(S);
		FMRProgressFlags& F = R.Flags;
		F.bAccessResolved = I > (int32)E1::AccessCheck; F.bPassportChecked = I > (int32)E1::PassportCheck; F.bAvatarConfirmed = I > (int32)E1::AvatarCheck;
		F.bArrivalSeen = I > (int32)E1::ArrivalCinematic; F.bCoreSpawned = I > (int32)E1::CoreSpawn; F.bFirstObjectiveDone = I > (int32)E1::FirstObjective;
		F.bTavianIntroduced = I > (int32)E1::TavianDialogue; F.bBartenderHandoff = I > (int32)E1::BartenderHandoff;
		if (S == E1::FirstMission) F.FirstQuestStatus = EMRQuestStatus::Offered;
		if (S == E1::FreeExplore) { F.FirstQuestStatus = EMRQuestStatus::Active; F.bOnboardingCompleted = true; }
		if (F.bAvatarConfirmed) { R.AvatarRef = TestRef(); }
		if (F.bCoreSpawned) { R.LastSafeSpawn.MapId = FName("TEST_FIXTURE_NONCANON_LOCATION"); R.LastSafeSpawn.SpawnPointId = FName("TEST_FIXTURE_NONCANON_SPAWN"); }
		return R;
	}
	void WriteV1(bool bB, const FMRProgressRecord& R, int32 Gen)
	{
		UMRProgressSaveGame* S = NewObject<UMRProgressSaveGame>(GetTransientPackage()); S->SaveVersion = 1; S->WriteGeneration = Gen; S->Record = R; S->Checksum = FMRProgressStore::ComputeChecksum(Gen, R);
		FMRProgressStore::WriteSlotForTest(bB, S);
	}
}

// ---------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Flag, "MoonRacer.OnboardingV2.Isolation.FlagShippingAndDefaultSlot", TestFlags)
bool FMRV2M_Flag::RunTest(const FString&)
{
	Setup();
	// without the explicit flag v1 remains active and the machine refuses
	MROnboardingV2Dev::SetFlagOverrideForTest(0);
	FString Why; TestFalse(TEXT("no flag: not allowed"), MROnboardingV2Dev::IsAllowed(&Why)); TestTrue(TEXT("the refusal names the flag"), Why.Contains(TEXT("MROnbV2Dev")));
	TestEqual(TEXT("no flag: v1 is the active flow"), MROnboardingV2Dev::ActiveFlow(), FName("V1"));
	{ FRig R; FString W; TestFalse(TEXT("no flag: Begin is refused"), R->Begin(&W)); TestTrue(TEXT("no flag: reason given, nothing begun, nothing written"), !R->HasBegun() && W.Contains(TEXT("flag")) && !Exists(false) && !Exists(true) && NumBackups() == 0); }
	TestFalse(TEXT("no flag: the v2 subsystem is not created"), GetDefault<UMROnboardingV2Subsystem>()->ShouldCreateSubsystem(nullptr));
	// the flag alone enables the development path
	MROnboardingV2Dev::SetFlagOverrideForTest(1);
	TestTrue(TEXT("flag present: allowed"), MROnboardingV2Dev::IsAllowed()); TestEqual(TEXT("flag present: V2_DEV"), MROnboardingV2Dev::ActiveFlow(), FName("V2_DEV"));
	TestTrue(TEXT("flag present: the v2 subsystem may be created"), GetDefault<UMROnboardingV2Subsystem>()->ShouldCreateSubsystem(nullptr));
	// Shipping refuses even WITH the flag
	MROnboardingV2Dev::SetSimulateShippingForTest(true);
	TestFalse(TEXT("shipping + flag: refused"), MROnboardingV2Dev::IsAllowed(&Why)); TestTrue(TEXT("shipping refusal reason"), Why.Contains(TEXT("Shipping")));
	TestEqual(TEXT("shipping + flag: v1"), MROnboardingV2Dev::ActiveFlow(), FName("V1"));
	TestFalse(TEXT("shipping + flag: no subsystem"), GetDefault<UMROnboardingV2Subsystem>()->ShouldCreateSubsystem(nullptr));
	{ FRig R; TestFalse(TEXT("shipping + flag: Begin is refused"), R->Begin(&Why)); TestTrue(TEXT("shipping: nothing written"), !Exists(false) && !Exists(true)); }
	MROnboardingV2Dev::SetSimulateShippingForTest(false);
	// the default player slot is refused: v2 is never activated for an existing profile
	FMRProgressStore::SetSlotBaseOverride(FMRCheckpointV2Store::DefaultSlotBase());
	{ FRig R; FString W; TestFalse(TEXT("default slot: Begin is refused"), R->Begin(&W)); TestTrue(TEXT("default slot: reason given"), W.Contains(TEXT("default"))); }
	TestFalse(TEXT("default slot: no default progress file was created"), IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(false)) || IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(true)));
	FMRProgressStore::SetSlotBaseOverride(Base);
	// v1 is unchanged
	TestTrue(TEXT("v1 keeps its 11 states and version 1; v2 has 12 states and its own table"), MROnboarding::Spine().Num() == 11 && MROnboarding::CurrentProgressVersion == 1 && MROnboardingV2::Spine().Num() == 12);
	TestTrue(TEXT("every state but FREE_EXPLORE has one distinct exit event"), [&]() { TSet<int32> Seen; for (int32 I = 0; I < 11; ++I) { const EEv E = MROnboardingV2Machine::ExitEventFor((EState)I); if (E == EEv::Count || Seen.Contains((int32)E)) return false; Seen.Add((int32)E); } return MROnboardingV2Machine::ExitEventFor(EState::FreeExplore) == EEv::Count; }());
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Transitions, "MoonRacer.OnboardingV2.StateMachine.EveryTransitionAndRejection", TestFlags)
bool FMRV2M_Transitions::RunTest(const FString&)
{
	Setup(); FRig R(true);
	TestFalse(TEXT("events before Begin are rejected"), R->HandleEvent(EEv::AccessResolved).bAccepted);
	TestTrue(TEXT("Begin"), R->Begin());
	TestEqual(TEXT("a new player starts at ACCESS_CHECK (START -> ACCESS_CHECK)"), R->GetState(), EState::AccessCheck);
	TestTrue(TEXT("START -> ACCESS_CHECK was checkpointed"), R->CheckpointWrites == 1);
	for (int32 J = 0; J < 10; ++J)
	{
		const EState From = MROnboardingV2::Spine()[J + 1], To = MROnboardingV2::Spine()[J + 2];
		TestEqual(FString::Printf(TEXT("state before step %d"), J), R->GetState(), From);
		const FMRCheckpointV2 Before = R->GetRecord(); const int32 Writes = R->CheckpointWrites;
		for (int32 E = 0; E < (int32)EEv::Count; ++E)
		{
			if ((EEv)E == Walk[J]) continue;
			const FMRV2TransitionResult X = R->HandleEvent((EEv)E, Pay(R.M.Get(), (EEv)E));
			if (X.bAccepted || R->GetState() != From) AddError(FString::Printf(TEXT("%s accepted/changed state in %s"), *MROnboardingV2Machine::EventName((EEv)E).ToString(), *MROnboardingV2::StateId(From).ToString()));
		}
		TestTrue(FString::Printf(TEXT("%s: rejected events change nothing and write nothing"), *MROnboardingV2::StateId(From).ToString()), R->GetRecord() == Before && R->CheckpointWrites == Writes);
		const FMRV2TransitionResult Ok = R->HandleEvent(Walk[J], Pay(R.M.Get(), Walk[J]));
		TestTrue(FString::Printf(TEXT("%s -> %s on %s"), *MROnboardingV2::StateId(From).ToString(), *MROnboardingV2::StateId(To).ToString(), *MROnboardingV2Machine::EventName(Walk[J]).ToString()), Ok.bAccepted && Ok.From == From && Ok.To == To && R->GetState() == To);
		TestTrue(TEXT("the transition is a state-boundary checkpoint and the record is consistent"), R->CheckpointWrites == Writes + 1 && R->GetRecord().Validate().Num() == 0 && R->GetRecord().CurrentState == MROnboardingV2::StateId(To));
	}
	TestEqual(TEXT("the walk ends in FREE_EXPLORE"), R->GetState(), EState::FreeExplore);
	TestTrue(TEXT("completed natively, not as a legacy player"), R->GetRecord().bOnboardingCompleted && !R->GetRecord().bLegacyCompleted && R->GetRecord().PassportScanResult == EMRPassportScanResult::OfflineGuestSimulated && R->GetRecord().bCoreArrived);
	for (int32 E = 0; E < (int32)EEv::Count; ++E) TestFalse(TEXT("FREE_EXPLORE is terminal"), R->HandleEvent((EEv)E, Pay(R.M.Get(), (EEv)E)).bAccepted);
	// the order of states is the 12-state spine, nothing from v1
	const TArray<FString> T = Transitions(R.M.Get());
	const TCHAR* Expected[] = { TEXT("START -> ACCESS_CHECK"), TEXT("ACCESS_CHECK -> IDENTITY_CHECK"), TEXT("IDENTITY_CHECK -> AVATAR_CHECK"), TEXT("AVATAR_CHECK -> STATION_ENTRY"), TEXT("STATION_ENTRY -> TAVERN_APPROACH"), TEXT("TAVERN_APPROACH -> TAVIAN_ENCOUNTER"),
		TEXT("TAVIAN_ENCOUNTER -> DEPARTURE_APPROACH"), TEXT("DEPARTURE_APPROACH -> PASSPORT_SCAN"), TEXT("PASSPORT_SCAN -> TRANSIT_TO_CORE"), TEXT("TRANSIT_TO_CORE -> CORE_ARRIVAL"), TEXT("CORE_ARRIVAL -> FREE_EXPLORE") };
	bool bOrder = T.Num() == UE_ARRAY_COUNT(Expected); for (int32 I = 0; bOrder && I < T.Num(); ++I) bOrder = T[I] == Expected[I];
	TestTrue(TEXT("transition order is exactly the 12-state spine"), bOrder);

	// payload requirements
	{ CleanProgress(); FRig P(true); P->Begin(); Advance(P, 2);
	  TestTrue(TEXT("AVATAR_CHECK rejects an empty avatar reference and stays put"), !P->HandleEvent(EEv::AvatarConfirmed).bAccepted && P->GetState() == EState::AvatarCheck);
	  P->HandleEvent(EEv::AvatarConfirmed, Pay(P.M.Get(), EEv::AvatarConfirmed));
	  TestTrue(TEXT("STATION_ENTRY rejects entry without a confirmed spawn"), !P->HandleEvent(EEv::StationEntered).bAccepted && !P->GetRecord().bStationEntered); }
	{ CleanProgress(); FRig P(true); P->Begin(); Advance(P, 7);
	  for (EMRPassportScanResult Bad : { EMRPassportScanResult::NotScanned, EMRPassportScanResult::LinkedVerified, EMRPassportScanResult::LegacyGrandfathered })
	  { FMRV2EventPayload X; X.Scan = Bad; TestTrue(TEXT("PASSPORT_SCAN accepts only the explicit OfflineGuestSimulated result"), !P->HandleEvent(EEv::PassportScanned, X).bAccepted); }
	  TestTrue(TEXT("no scan and no authorization were recorded by the refused results"), P->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned && P->GetRecord().TravelAuthorization == EMRTravelAuthorization::NotAuthorized); }
	{ CleanProgress(); FRig P(true); P->Begin(); Advance(P, 9);
	  TestEqual(TEXT("at CORE_ARRIVAL"), P->GetState(), EState::CoreArrival);
	  TestTrue(TEXT("CORE_ARRIVAL rejects arrival without a confirmed spawn and stays incomplete"), !P->HandleEvent(EEv::CoreArrived).bAccepted && !P->GetRecord().bCoreArrived && !P->GetRecord().bOnboardingCompleted); }
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Boundary, "MoonRacer.OnboardingV2.StateMachine.EveryStateBoundaryResume", TestFlags)
bool FMRV2M_Boundary::RunTest(const FString&)
{
	// after J completed steps the checkpoint's first incomplete state is the resume target; access, identity and avatar are always re-checked first
	const EState Target[] = { EState::AccessCheck, EState::IdentityCheck, EState::AvatarCheck, EState::StationEntry, EState::TavernApproach, EState::TavianEncounter, EState::DepartureApproach, EState::PassportScan, EState::TransitToCore, EState::CoreArrival, EState::FreeExplore };
	for (int32 J = 0; J <= 10; ++J)
	{
		Setup(); const FString Lbl = FString::Printf(TEXT("boundary after %d steps"), J);
		{ FRig A(true); A->Begin(); TestTrue(Lbl + TEXT(": advanced"), Advance(A, J)); }
		FRig R(true); TestTrue(Lbl + TEXT(": relaunch begins"), R->Begin());
		TestEqual(Lbl + TEXT(": resume target"), R->GetResumeTarget(), Target[J]);
		if (J == 10) { TestEqual(Lbl + TEXT(": a completed player goes straight to FREE_EXPLORE"), R->GetState(), EState::FreeExplore); TestTrue(Lbl + TEXT(": no write on return"), R->CheckpointWrites == 0); continue; }
		TestEqual(Lbl + TEXT(": relaunch starts at ACCESS_CHECK"), R->GetState(), EState::AccessCheck);
		for (int32 K = 0; K < 3; ++K) { TestTrue(Lbl + TEXT(": re-check step accepted"), R->HandleEvent(Walk[K], Pay(R.M.Get(), Walk[K])).bAccepted); }
		const EState Expected = J >= 3 ? Target[J] : EState::StationEntry;
		TestEqual(Lbl + TEXT(": after the re-checks play resumes at the first incomplete state"), R->GetState(), Expected);
		TestTrue(Lbl + TEXT(": the record stays consistent and never moves backwards"), R->GetRecord().Validate().Num() == 0 && MROnboardingV2::FirstIncompleteState(R->GetRecord()) == Expected);
	}
	// service-driven resume (auto): a relaunch placed at the departure approach re-loads that location at its saved safe spawn and does not replay earlier work
	{ Setup(); { FRig A; A->Begin(); A.Reach(); }   // runs to DEPARTURE_APPROACH (encounter fixture completes immediately)
	  FRig R; R->Begin();
	  TestEqual(TEXT("auto resume lands at DEPARTURE_APPROACH"), R->GetState(), EState::DepartureApproach);
	  TestTrue(TEXT("only the departure location was loaded (no station/tavern replay)"), R.W->LoadLog.Num() == 1 && R.W->LoadLog[0] == R->Content.DepartureLoc);
	  TestTrue(TEXT("the encounter was not replayed"), R.Dl->RunCount == 0 && R.Av->CreatorOpenCount == 0); }
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Flow, "MoonRacer.OnboardingV2.StateMachine.FullFlowAndReturningPlayer", TestFlags)
bool FMRV2M_Flow::RunTest(const FString&)
{
	Setup();
	{
		FRig R; TestTrue(TEXT("Begin"), R->Begin());
		TestEqual(TEXT("service-driven flow runs access, identity, avatar, station and waits at the tavern objective"), R->GetState(), EState::TavernApproach);
		TestTrue(TEXT("avatar came from the avatar service; the creator was not opened"), R->GetRecord().bAvatarConfirmed && R->GetRecord().AvatarRef == TestRef() && R.Av->CreatorOpenCount == 0);
		TestTrue(TEXT("launch identity resolved with NO physical scan yet"), R->GetRecord().bIdentityResolved && R->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned);
		R.Reach();
		TestEqual(TEXT("encounter runs, then waits at the departure objective"), R->GetState(), EState::DepartureApproach);
		R.Reach();
		TestEqual(TEXT("scan, transit and arrival complete"), R->GetState(), EState::FreeExplore);
		const FMRCheckpointV2& Rec = R->GetRecord();
		TestTrue(TEXT("the full chain is recorded"), Rec.bStationEntered && Rec.bTavernReached && Rec.bTavianEncounterDone && Rec.bDepartureReached && Rec.PassportScanResult == EMRPassportScanResult::OfflineGuestSimulated && Rec.TravelAuthorization == EMRTravelAuthorization::Authorized && Rec.bTransitSeen && !Rec.bTransitSkippedUnavailable && Rec.bCoreArrived && Rec.bOnboardingCompleted && !Rec.bLegacyCompleted);
		TestTrue(TEXT("a per-location safe spawn exists for each of the four fixture locations"), Rec.SafeSpawns.Num() == 4 && Rec.FindSafeSpawn(R->Content.StationLoc) && Rec.FindSafeSpawn(R->Content.TavernLoc) && Rec.FindSafeSpawn(R->Content.DepartureLoc) && Rec.FindSafeSpawn(R->Content.CoreLoc) && Rec.FindSafeSpawn(R->Content.CoreLoc)->SpawnPointId == R->Content.CoreSpawn);
		TestTrue(TEXT("no scan result is an authentication: identity mode offline, no subject id"), Rec.IdentityMode == EMRIdentityMode::OfflineGuest && Rec.OpaqueSubjectId.IsEmpty() && !UMRDevPassportScanService::ClaimsAuthentication());
		TestTrue(TEXT("locations loaded in order, each once"), R.W->LoadLog.Num() == 4 && R.W->LoadLog[0] == R->Content.StationLoc && R.W->LoadLog[3] == R->Content.CoreLoc);
		TestTrue(TEXT("11 transitions + the encounter-started marker = 12 state-boundary writes, no failures"), R->CheckpointWrites == 12 && R->CheckpointFailures == 0);
		TestTrue(TEXT("the persisted checkpoint is the in-memory record (native v2)"), [&]() { FMRV2LoadReport L; const FMRCheckpointV2 P = FMRCheckpointV2Store::Load(NoEv(), L); return L.SourceVersion == 2 && P == Rec; }());
		TestTrue(TEXT("a clean run reports no cross-save inconsistency"), !R->Reconcile().HasConflict());
		TestTrue(TEXT("the encounter dialogue ran exactly once"), R.Dl->RunCount == 1);
	}
	{
		FRig R; R->Begin();
		TestEqual(TEXT("a returning player goes straight to FREE_EXPLORE"), R->GetState(), EState::FreeExplore);
		TestTrue(TEXT("no service was used and nothing was written"), R.W->LoadLog.Num() == 0 && R.Sc->ScanCount == 0 && R.Dl->RunCount == 0 && R->CheckpointWrites == 0 && NumBackups() == 0);
	}
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Gate, "MoonRacer.OnboardingV2.Departure.GateEvaluator", TestFlags)
bool FMRV2M_Gate::RunTest(const FString&)
{
	FMRNarrativeEvidence E; E.bAvailable = true;
	FMRDepartureConfig C;
	TestTrue(TEXT("unconfigured: BLOCKED as unresolved"), [&]() { const FMRDepartureResult R = MRDeparture::Evaluate(C, E); return !R.bOpen && R.bUnresolved; }());
	C.bResolved = true;
	TestTrue(TEXT("resolved but an empty list without the explicit no-requirements statement: BLOCKED"), [&]() { const FMRDepartureResult R = MRDeparture::Evaluate(C, E); return !R.bOpen && R.bUnresolved; }());
	C.bNoRequirementsByDesign = true; TestTrue(TEXT("an explicit no-requirements gate is open"), MRDeparture::Evaluate(C, E).bOpen);
	C.bNoRequirementsByDesign = false;
	const FName Subject("TEST_FIXTURE_SUBJECT");
	auto Cond = [&](EMRDepartureConditionType T) { FMRDepartureConfig X; X.bResolved = true; FMRDepartureCondition D; D.Type = T; D.Subject = Subject; X.Conditions.Add(D); return X; };
	TestFalse(TEXT("fact: unmet"), MRDeparture::Evaluate(Cond(EMRDepartureConditionType::FactSet), E).bOpen);
	E.Facts.Add(Subject); TestTrue(TEXT("fact: met"), MRDeparture::Evaluate(Cond(EMRDepartureConditionType::FactSet), E).bOpen);
	TestFalse(TEXT("dialogue: unmet"), MRDeparture::Evaluate(Cond(EMRDepartureConditionType::DialogueCompleted), E).bOpen);
	E.CompletedDialogues.Add(Subject); TestTrue(TEXT("dialogue: met"), MRDeparture::Evaluate(Cond(EMRDepartureConditionType::DialogueCompleted), E).bOpen);
	TestFalse(TEXT("objective: unmet"), MRDeparture::Evaluate(Cond(EMRDepartureConditionType::ObjectiveCompleted), E).bOpen);
	E.CompletedObjectives.Add(Subject); TestTrue(TEXT("objective: met"), MRDeparture::Evaluate(Cond(EMRDepartureConditionType::ObjectiveCompleted), E).bOpen);
	// acceptance and completion are DISTINCT
	for (EMRQuestStatus S : { EMRQuestStatus::NotOffered, EMRQuestStatus::Offered, EMRQuestStatus::Active, EMRQuestStatus::Completed })
	{
		E.Missions.Add(Subject, S);
		const bool bAcc = MRDeparture::Evaluate(Cond(EMRDepartureConditionType::MissionAccepted), E).bOpen, bCom = MRDeparture::Evaluate(Cond(EMRDepartureConditionType::MissionCompleted), E).bOpen;
		TestEqual(FString::Printf(TEXT("status %d: 'accepted' gate"), (int32)S), bAcc, S == EMRQuestStatus::Active || S == EMRQuestStatus::Completed);
		TestEqual(FString::Printf(TEXT("status %d: 'completed' gate (acceptance alone never satisfies it)"), (int32)S), bCom, S == EMRQuestStatus::Completed);
	}
	// all conditions must hold; unmet ones are listed
	FMRDepartureConfig Two = Cond(EMRDepartureConditionType::FactSet); FMRDepartureCondition D2; D2.Type = EMRDepartureConditionType::FactSet; D2.Subject = FName("TEST_FIXTURE_OTHER"); Two.Conditions.Add(D2);
	const FMRDepartureResult R2 = MRDeparture::Evaluate(Two, E); TestTrue(TEXT("one unmet condition blocks and is named"), !R2.bOpen && !R2.bUnresolved && R2.Unmet.Num() == 1 && R2.Unmet[0].Contains(TEXT("TEST_FIXTURE_OTHER")));
	// unavailable evidence cannot satisfy conditions
	FMRNarrativeEvidence NoNarr; TestTrue(TEXT("narrative state unavailable: BLOCKED as unresolved"), [&]() { const FMRDepartureResult R = MRDeparture::Evaluate(Cond(EMRDepartureConditionType::FactSet), NoNarr); return !R.bOpen && R.bUnresolved; }());
	TestTrue(TEXT("the canonical artifact mission is not hard-coded: a default config is unresolved"), !FMRV2FixtureContent().Departure.bResolved);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_GateMachine, "MoonRacer.OnboardingV2.Departure.GateBlocksTheMachineSafely", TestFlags)
bool FMRV2M_GateMachine::RunTest(const FString&)
{
	Setup();
	// unresolved config: the terminal refuses to scan; nothing is recorded; retry re-evaluates
	{ FRig R; R->Content.Departure = FMRDepartureConfig(); R->Begin(); R.Reach(); R.Reach();
	  TestTrue(TEXT("unresolved gate: blocked at PASSPORT_SCAN"), R->GetState() == EState::PassportScan && R->IsBlocked() && R->GetBlockReason().Contains(TEXT("unresolved")));
	  const int32 W = R->CheckpointWrites;
	  TestTrue(TEXT("no scan was attempted and nothing was recorded or written"), R.Sc->ScanCount == 0 && R->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned && R->GetRecord().TravelAuthorization == EMRTravelAuthorization::NotAuthorized);
	  R->Retry(); TestTrue(TEXT("retry with the gate still unresolved stays blocked"), R->IsBlocked() && R.Sc->ScanCount == 0 && R->CheckpointWrites == W);
	  R->Content.Departure.bResolved = true; R->Content.Departure.bNoRequirementsByDesign = true; R->Retry();
	  TestEqual(TEXT("once configured, retry scans and the flow completes"), R->GetState(), EState::FreeExplore); }
	// resolved but unmet (no narrative evidence available): blocked as well
	{ CleanProgress(); FRig R; FMRDepartureCondition D; D.Type = EMRDepartureConditionType::FactSet; D.Subject = FName("TEST_FIXTURE_GATE_FACT"); R->Content.Departure.bNoRequirementsByDesign = false; R->Content.Departure.Conditions.Add(D);
	  FMRNarrativeEvidence Live; Live.bAvailable = true; R->EvidenceProvider = [&Live]() { FMRSaveEvidence S; S.Narrative = Live; return S; };
	  R->Begin(); R.Reach(); R.Reach();
	  TestTrue(TEXT("unmet condition: blocked, retryable, names the condition"), R->IsBlocked() && R->IsBlockRetryable() && R->GetBlockReason().Contains(TEXT("TEST_FIXTURE_GATE_FACT")) && R.Sc->ScanCount == 0);
	  Live.Facts.Add(FName("TEST_FIXTURE_GATE_FACT")); R->Retry();
	  TestEqual(TEXT("condition met: retry proceeds through scan, transit and arrival"), R->GetState(), EState::FreeExplore); }
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Scan, "MoonRacer.OnboardingV2.Passport.ScanRefusalRetryAndSimulation", TestFlags)
bool FMRV2M_Scan::RunTest(const FString&)
{
	Setup(); FRig R;
	R.Sc->Mode = UMRDevPassportScanService::EMode::Refuse;
	R->Begin(); R.Reach(); const int32 WBefore = R->CheckpointWrites; R.Reach();
	TestTrue(TEXT("refused scan: blocked at PASSPORT_SCAN, retryable"), R->GetState() == EState::PassportScan && R->IsBlocked() && R->IsBlockRetryable() && R.Sc->ScanCount == 1);
	TestTrue(TEXT("refused scan: nothing recorded, no authorization, no extra checkpoint (the departure transition wrote its own)"), R->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned && R->GetRecord().TravelAuthorization == EMRTravelAuthorization::NotAuthorized && R->CheckpointWrites == WBefore + 1);
	TestTrue(TEXT("launch identity is separate: still resolved"), R->GetRecord().bIdentityResolved);
	R.Sc->Mode = UMRDevPassportScanService::EMode::Unavailable; R->Retry(); TestTrue(TEXT("unavailable scanner: still blocked, still nothing recorded"), R->IsBlocked() && R.Sc->ScanCount == 2 && R->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned);
	R.Sc->Mode = UMRDevPassportScanService::EMode::ReturnLinkedVerified; R->Retry();
	TestTrue(TEXT("a LinkedVerified result is refused by the development path (no live Passport)"), R->IsBlocked() && R->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned && R->GetRecord().TravelAuthorization == EMRTravelAuthorization::NotAuthorized);
	R.Sc->Mode = UMRDevPassportScanService::EMode::Hold; R->Retry();
	TestTrue(TEXT("scan in progress: waiting, nothing recorded"), R.Sc->HasPending() && !R->IsBlocked() && R->GetState() == EState::PassportScan && R->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned);
	R.Sc->CancelScan();
	TestTrue(TEXT("interrupted scan: blocked, retryable, nothing recorded"), R->IsBlocked() && R->IsBlockRetryable() && R->GetBlockReason().Contains(TEXT("interrupted")) && R->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned);
	// relaunch during a scan: the scan is not recorded, so the player resumes at PASSPORT_SCAN
	R.Sc->Mode = UMRDevPassportScanService::EMode::Hold; R->Retry(); TestTrue(TEXT("scan pending again"), R.Sc->HasPending());
	FRig R2; R2.Sc->Mode = UMRDevPassportScanService::EMode::Hold; R2->Begin();
	TestTrue(TEXT("interrupted-scan recovery: after a relaunch the player is at PASSPORT_SCAN with no scan recorded"), R2->GetState() == EState::PassportScan && R2.Sc->HasPending() && R2->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned && R2->GetRecord().bDepartureReached);
	TestTrue(TEXT("only the departure location was reloaded"), R2.W->LoadLog.Num() == 1);
	FMRScanResponse Ok; Ok.Outcome = EMRScanOutcome::Scanned; Ok.Result = EMRPassportScanResult::OfflineGuestSimulated; R2.Sc->CompleteHeld(Ok);
	TestEqual(TEXT("the offline simulated scan completes the flow"), R2->GetState(), EState::FreeExplore);
	const FMRCheckpointV2& Rec = R2->GetRecord();
	TestTrue(TEXT("recorded as OfflineGuestSimulated + Authorized"), Rec.PassportScanResult == EMRPassportScanResult::OfflineGuestSimulated && Rec.TravelAuthorization == EMRTravelAuthorization::Authorized);
	TestTrue(TEXT("the simulated scan is NOT authentication: offline identity, no subject id, no tokens in the record"), Rec.IdentityMode == EMRIdentityMode::OfflineGuest && Rec.OpaqueSubjectId.IsEmpty() && !UMRDevPassportScanService::ClaimsAuthentication() && Rec.Validate().Num() == 0);
	// the scan is recorded separately from identity: identity was resolved before and independent of it
	TestTrue(TEXT("identity and scan are separate fields"), Rec.bIdentityResolved && Rec.PassportScanResult != EMRPassportScanResult::NotScanned);
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Transit, "MoonRacer.OnboardingV2.Transit.InterruptionOutcomesAndMissingDestination", TestFlags)
bool FMRV2M_Transit::RunTest(const FString&)
{
	// cinematic outcomes
	struct FCase { const TCHAR* Name; bool bAvail, bSkip; bool bSeen, bUnavail; };
	for (const FCase& C : { FCase{ TEXT("Played"), true, false, true, false }, FCase{ TEXT("SkippedByPlayer"), true, true, true, false }, FCase{ TEXT("SkippedUnavailable"), false, false, false, true } })
	{
		Setup(); FRig R; R.Ci->bAvailable = C.bAvail; R.Ci->bPlayerSkips = C.bSkip; R->Begin(); R.Reach(); R.Reach();
		const FMRCheckpointV2& Rec = R->GetRecord();
		TestTrue(FString::Printf(TEXT("%s: transit recorded as expected and the flow completes"), C.Name), R->GetState() == EState::FreeExplore && Rec.bTransitSeen == C.bSeen && Rec.bTransitSkippedUnavailable == C.bUnavail && Rec.bCoreArrived && Rec.Validate().Num() == 0);
		if (!C.bAvail) TestTrue(TEXT("an unavailable cinematic is never recorded as seen"), R.Ci->PlayCount == 0 && !Rec.bTransitSeen);
	}
	// missing destination: transit does not start, nothing is recorded, retry works
	{ Setup(); FRig R; R.W->UnavailableLocations.Add(R->Content.CoreLoc); R->Begin(); R.Reach(); R.Reach();
	  TestTrue(TEXT("missing destination: blocked at TRANSIT_TO_CORE"), R->GetState() == EState::TransitToCore && R->IsBlocked() && R->GetBlockReason().Contains(TEXT("destination")));
	  TestTrue(TEXT("no transit played or recorded, no arrival"), R.Ci->PlayCount == 0 && !R->GetRecord().bTransitSeen && !R->GetRecord().bTransitSkippedUnavailable && !R->GetRecord().bCoreArrived && R->GetRecord().TravelAuthorization == EMRTravelAuthorization::Authorized);
	  R.W->UnavailableLocations.Empty(); R->Retry(); TestEqual(TEXT("destination available: retry completes"), R->GetState(), EState::FreeExplore); }
	// interrupted transit
	{ Setup(); { FRig R; R.Ci->bHold = true; R->Begin(); R.Reach(); R.Reach();
	    TestTrue(TEXT("transit playing: waiting, nothing recorded"), R->GetState() == EState::TransitToCore && R.Ci->HasPending() && !R->GetRecord().bTransitSeen && !R->GetRecord().bTransitSkippedUnavailable); }   // the process 'dies' here
	  FRig R2; R2->Begin();
	  TestTrue(TEXT("interrupted-transit recovery: the relaunch resumed at TRANSIT_TO_CORE (authorization retained) and finished the flow"), R2->GetState() == EState::FreeExplore && R2->GetRecord().TravelAuthorization == EMRTravelAuthorization::Authorized);
	  TestTrue(TEXT("transit replayed once, then arrival; no earlier state replayed"), R2.Ci->PlayCount == 1 && R2.W->LoadLog.Num() == 2 && R2->GetRecord().bTransitSeen && R2->GetRecord().bCoreArrived && R2.Sc->ScanCount == 0); }
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Arrival, "MoonRacer.OnboardingV2.Arrival.NoMidLoadCompletionMissingLocationsAndSafeSpawns", TestFlags)
bool FMRV2M_Arrival::RunTest(const FString&)
{
	// Core arrival is not complete until the destination loads AND a spawn is confirmed; no checkpoint is written mid-load
	{ Setup(); FRig R; R.Ci->bHold = true; R->Begin(); R.Reach(); R.Reach(); TestTrue(TEXT("held at transit"), R.Ci->HasPending());
	  R.W->bHold = true; R.Sp->bHold = false; R.Ci->CompleteHeld(EMRArrivalOutcome::Played);
	  const int32 W = R->CheckpointWrites;
	  TestTrue(TEXT("destination loading: state is CORE_ARRIVAL, NOT arrived, NOT completed"), R->GetState() == EState::CoreArrival && R.W->HasPending() && !R->GetRecord().bCoreArrived && !R->GetRecord().bOnboardingCompleted);
	  R.Sp->bHold = true; R.W->CompleteHeld(EMRServiceResult::Ok);
	  TestTrue(TEXT("destination loaded but the spawn is not confirmed: still not arrived, no checkpoint"), R.Sp->HasPending() && !R->GetRecord().bCoreArrived && !R->GetRecord().bOnboardingCompleted && R->CheckpointWrites == W);
	  R.Sp->CompleteHeld(EMRServiceResult::Ok);
	  TestTrue(TEXT("spawn confirmed: arrival recorded, completed, ONE checkpoint, safe spawn stored"), R->GetState() == EState::FreeExplore && R->GetRecord().bCoreArrived && R->GetRecord().bOnboardingCompleted && R->CheckpointWrites == W + 1 && R->GetRecord().FindSafeSpawn(R->Content.CoreLoc)); }
	// the load fails after transit: blocked, transit stays recorded, arrival not recorded
	{ Setup(); FRig R; R.Ci->bHold = true; R->Begin(); R.Reach(); R.Reach(); R.W->UnavailableLocations.Add(R->Content.CoreLoc); R.Ci->CompleteHeld(EMRArrivalOutcome::Played);
	  TestTrue(TEXT("Core load failed: blocked at CORE_ARRIVAL; transit kept, arrival not recorded, not completed"), R->GetState() == EState::CoreArrival && R->IsBlocked() && R->GetRecord().bTransitSeen && !R->GetRecord().bCoreArrived && !R->GetRecord().bOnboardingCompleted);
	  R.W->UnavailableLocations.Empty(); R->Retry(); TestEqual(TEXT("retry completes"), R->GetState(), EState::FreeExplore); }
	// a relaunch during the Core load resumes at CORE_ARRIVAL, never at FREE_EXPLORE
	{ Setup(); { FRig R; R.Ci->bHold = true; R->Begin(); R.Reach(); R.Reach(); R.W->bHold = true; R.Ci->CompleteHeld(EMRArrivalOutcome::Played); TestTrue(TEXT("mid-load"), R.W->HasPending()); }
	  FRig R2; R2->Begin(); TestTrue(TEXT("resumes at CORE_ARRIVAL and completes there"), R2->GetState() == EState::FreeExplore && R2->GetRecord().bTransitSeen && R2->GetRecord().bCoreArrived && R2.Ci->PlayCount == 0); }
	// missing station location
	{ Setup(); FRig R; R.W->UnavailableLocations.Add(R->Content.StationLoc); R->Begin();
	  TestTrue(TEXT("missing station: blocked at STATION_ENTRY, not entered, nothing past it"), R->GetState() == EState::StationEntry && R->IsBlocked() && !R->GetRecord().bStationEntered && R->GetRecord().SafeSpawns.Num() == 0);
	  R.W->UnavailableLocations.Empty(); R->Retry(); TestEqual(TEXT("retry enters the station and proceeds"), R->GetState(), EState::TavernApproach); }
	// safe-spawn recovery: a checkpoint holding per-location safe spawns that differ from the defaults
	{ Setup(); const FMRV2FixtureContent C0; FMRCheckpointV2 Rec = FMRCheckpointV2::MakeNew();
	  Rec.bAccessResolved = Rec.bIdentityResolved = Rec.bAvatarConfirmed = Rec.bStationEntered = Rec.bTavernReached = Rec.bTavianEncounterStarted = true; Rec.AvatarRef = TestRef();
	  { FMRLocationSafeSpawn S; S.LocationId = C0.StationLoc; S.SpawnPointId = FName("TEST_FIXTURE_NONCANON_V2_SPAWN_STATION_ALT"); Rec.SafeSpawns.Add(S); FMRLocationSafeSpawn T; T.LocationId = C0.TavernLoc; T.SpawnPointId = FName("TEST_FIXTURE_NONCANON_V2_SPAWN_TAVERN_ALT"); Rec.SafeSpawns.Add(T); }
	  Rec.CurrentState = FName("TAVIAN_ENCOUNTER"); TestTrue(TEXT("fixture record valid"), Rec.Validate().Num() == 0);
	  auto Seed = [&]() { CleanProgress(); FMRCheckpointV2Store::WriteSlotV2ForTest(false, 1, Rec); };
	  Seed();
	  { FRig R; R->Begin(); TestTrue(TEXT("resume uses the SAVED per-location safe spawn of the tavern"), R.Sp->SpawnLog.Num() >= 1 && R.Sp->SpawnLog[0].EndsWith(TEXT("TAVERN_ALT"))); }
	  { Seed(); FRig R; R.Sp->FailingSpawns.Add(FName("TEST_FIXTURE_NONCANON_V2_SPAWN_TAVERN_ALT")); R->Begin();
	    TestTrue(TEXT("a failing saved spawn falls back to the location's default spawn once, then play continues"), R.Sp->SpawnLog.Num() >= 2 && R.Sp->SpawnLog[0].EndsWith(TEXT("TAVERN_ALT")) && R.Sp->SpawnLog[1].EndsWith(TEXT("V2_SPAWN_TAVERN")) && R->GetState() == EState::DepartureApproach); }
	  { Seed(); FRig R; R.Sp->FailingSpawns.Add(FName("TEST_FIXTURE_NONCANON_V2_SPAWN_TAVERN_ALT")); R.Sp->FailingSpawns.Add(FName("TEST_FIXTURE_NONCANON_V2_SPAWN_TAVERN")); R->Begin();
	    TestTrue(TEXT("both spawns failing: blocked, the encounter did not run"), R->IsBlocked() && R->GetState() == EState::TavianEncounter && R.Dl->RunCount == 0); }
	  // stuck-player recovery
	  { CleanProgress(); FRig R; R->Begin(); R.Reach(); TestTrue(TEXT("at DEPARTURE_APPROACH"), R->GetState() == EState::DepartureApproach);
	    TestTrue(TEXT("RecoverToSafeSpawn returns the player to the safe spawn of the current location"), R->RecoverToSafeSpawn() && R.Sp->TeleportCount == 1 && R.Sp->LastLocation == R->Content.DepartureLoc && R.Sp->LastSpawn == R->Content.DepartureSpawn && R->GetState() == EState::DepartureApproach); } }
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Narrative, "MoonRacer.OnboardingV2.Narrative.EncounterInterruptionOneTimeEffectsAndOptionalNpcs", TestFlags)
bool FMRV2M_Narrative::RunTest(const FString&)
{
	Setup();
	FRig R; TestTrue(TEXT("fixture narrative bundle validated and registered"), R.Narrative());
	R->MigrationMap.TavianDialogueIds = { GraphAlpha() };
	R->Begin(); TestEqual(TEXT("at the tavern objective (a standalone objective in the narrative runtime)"), R->GetState(), EState::TavernApproach);
	TestEqual(TEXT("the objective tracker shows the tavern objective"), R.N->GetStandaloneObjective(), R->Content.TavernObjective);
	// optional NPC interaction before the encounter: allowed, changes nothing about onboarding
	{ FString W; TestFalse(TEXT("the encounter NPC is part of the flow and refused as optional"), R->InteractOptional(NpcAlpha(), &W)); TestTrue(TEXT("reason given"), W.Contains(TEXT("flow")));
	  const FMRCheckpointV2 Before = R->GetRecord(); const int32 Writes = R->CheckpointWrites;
	  TestTrue(TEXT("an optional NPC conversation starts"), R->InteractOptional(NpcBeta())); Drive(R.N.Get(), {});
	  TestTrue(TEXT("optional dialogue completed in the narrative save"), R.N->GetState().CompletedDialogues.Contains(GraphBeta()));
	  TestTrue(TEXT("onboarding state, record and checkpoints are unchanged by an optional NPC"), R->GetState() == EState::TavernApproach && R->GetRecord() == Before && R->CheckpointWrites == Writes); }
	R.ReachNarr(R->Content.TavernObjective);
	TestTrue(TEXT("encounter started: dialogue active, started marker recorded and checkpointed, NOT done"), R->GetState() == EState::TavianEncounter && R.N->GetRuntime()->IsActive() && R->GetRecord().bTavianEncounterStarted && !R->GetRecord().bTavianEncounterDone);
	TestTrue(TEXT("the one-time 'met' effect fired once on entering the conversation"), R.N->EffectsApplied == 1 && R.N->IsFactSet(FactMet()));
	R.N->GetRuntime()->Cancel();
	TestTrue(TEXT("interrupted dialogue: blocked, retryable, encounter NOT done, mission untouched"), R->IsBlocked() && R->IsBlockRetryable() && R->GetBlockReason().Contains(TEXT("interrupted")) && !R->GetRecord().bTavianEncounterDone && R.N->GetMissionStatus(Mission()) == EMRQuestStatus::NotOffered);
	R->Retry();
	TestTrue(TEXT("retry restarts the dialogue from the beginning; the one-time effect is suppressed, not repeated"), R.N->GetRuntime()->IsActive() && R.N->EffectsApplied == 1 && R.N->EffectsSuppressed == 1);
	// relaunch in the middle of the conversation
	FRig R2; R2.Narrative(/*LoadState*/ true);
	TestTrue(TEXT("the narrative save kept the one-time ledger across the 'crash'"), R2.N->GetState().FiredEffects.Contains(FxMet()));
	R2->MigrationMap.TavianDialogueIds = { GraphAlpha() };
	R2->Begin();
	TestTrue(TEXT("interrupted-dialogue recovery: the relaunch resumes at TAVIAN_ENCOUNTER and knows it was interrupted"), R2->GetState() == EState::TavianEncounter && R2->WasDialogueInterrupted() && R2.N->GetRuntime()->IsActive());
	TestTrue(TEXT("no earlier state was replayed (only the tavern location loaded)"), R2.W->LoadLog.Num() == 1 && R2.W->LoadLog[0] == R2->Content.TavernLoc);
	TestTrue(TEXT("the one-time effect is not replayed after the relaunch"), R2.N->EffectsApplied == 0 && R2.N->EffectsSuppressed == 1);
	Drive(R2.N.Get(), { FName("c_yes") });
	TestEqual(TEXT("accepting the (fixture) mission completes the encounter and moves on"), R2->GetState(), EState::DepartureApproach);
	TestTrue(TEXT("the mission is ACCEPTED (Active), not completed; effects applied once each"), R2.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active && R2->GetRecord().bTavianEncounterDone && R2.N->EffectsApplied == 2);
	TestTrue(TEXT("onboarding never auto-advanced from evidence: the encounter was completed by playing it"), R2->GetRecord().Validate().Num() == 0);
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_MissionGate, "MoonRacer.OnboardingV2.Narrative.MissionAcceptanceVersusCompletionAndObjectives", TestFlags)
bool FMRV2M_MissionGate::RunTest(const FString&)
{
	// a departure gate that needs the mission COMPLETED, not just accepted
	{
		Setup(); FRig R; R.Narrative();
		FMRDepartureCondition D1; D1.Type = EMRDepartureConditionType::DialogueCompleted; D1.Subject = GraphAlpha();
		FMRDepartureCondition D2; D2.Type = EMRDepartureConditionType::MissionCompleted; D2.Subject = Mission();
		R->Content.Departure.bNoRequirementsByDesign = false; R->Content.Departure.Conditions = { D1, D2 };
		R->Begin(); R.ReachNarr(R->Content.TavernObjective); Drive(R.N.Get(), { FName("c_yes") });
		TestEqual(TEXT("encounter done, at the departure objective"), R->GetState(), EState::DepartureApproach);
		TestEqual(TEXT("mission accepted"), R.N->GetMissionStatus(Mission()), EMRQuestStatus::Active);
		R.ReachNarr(R->Content.DepartureObjective);
		TestTrue(TEXT("ACCEPTED is not COMPLETED: the gate blocks departure and names the unmet condition"), R->GetState() == EState::PassportScan && R->IsBlocked() && R->GetBlockReason().Contains(TEXT("mission completed")) && R.Sc->ScanCount == 0);
		// optional NPC while blocked
		{ const FMRCheckpointV2 Before = R->GetRecord(); const int32 W = R->CheckpointWrites;
		  TestTrue(TEXT("optional NPC while the gate blocks"), R->InteractOptional(NpcBeta())); Drive(R.N.Get(), {});
		  TestTrue(TEXT("optional interaction does not change onboarding or write a checkpoint"), R->GetRecord() == Before && R->CheckpointWrites == W && R->IsBlocked()); }
		// objective tracking
		TestTrue(TEXT("the tracker shows the mission's first objective"), R.N->GetTrackedObjective().bValid && R.N->GetTrackedObjective().ObjectiveId == Obj1());
		R.N->NotifyGameEvent(EvtObj1());
		TestTrue(TEXT("objective 1 completed; tracker advances to objective 2; mission still Active"), R.N->IsObjectiveCompleted(Obj1()) && R.N->GetTrackedObjective().ObjectiveId == Obj2() && R.N->GetMissionStatus(Mission()) == EMRQuestStatus::Active);
		R->Retry(); TestTrue(TEXT("one objective is not enough: still blocked"), R->IsBlocked() && R.Sc->ScanCount == 0);
		R.N->NotifyGameEvent(EvtObj2());
		TestEqual(TEXT("both objectives completed: the mission is COMPLETED"), R.N->GetMissionStatus(Mission()), EMRQuestStatus::Completed);
		R->Retry();
		TestEqual(TEXT("with the mission completed, retry passes the gate, scans, transits and arrives"), R->GetState(), EState::FreeExplore);
		TestTrue(TEXT("scan recorded as the explicit simulation"), R->GetRecord().PassportScanResult == EMRPassportScanResult::OfflineGuestSimulated && R.Sc->ScanCount == 1);
		TestTrue(TEXT("one-time effects were never replayed"), R.N->EffectsApplied == 3 && R.N->EffectsSuppressed == 0);   // met + offer + accept
	}
	// declining the offer: the gate for ACCEPTANCE stays closed until the mission is accepted by another route; accepted (Active) then satisfies it
	{
		Setup(); FRig R; R.Narrative();
		FMRDepartureCondition D; D.Type = EMRDepartureConditionType::MissionAccepted; D.Subject = Mission();
		R->Content.Departure.bNoRequirementsByDesign = false; R->Content.Departure.Conditions = { D };
		R->Begin(); R.ReachNarr(R->Content.TavernObjective); Drive(R.N.Get(), { FName("c_no") });
		TestTrue(TEXT("declined: the encounter is done (the conversation happened) but the mission was never offered"), R->GetState() == EState::DepartureApproach && R->GetRecord().bTavianEncounterDone && R.N->GetMissionStatus(Mission()) == EMRQuestStatus::NotOffered);
		R.ReachNarr(R->Content.DepartureObjective);
		TestTrue(TEXT("departure blocked: mission not accepted"), R->GetState() == EState::PassportScan && R->IsBlocked() && R.Sc->ScanCount == 0);
		R.N->OfferMission(Mission()); R->Retry(); TestTrue(TEXT("OFFERED is not accepted either"), R->IsBlocked());
		R.N->AcceptMission(Mission()); R->Retry();
		TestEqual(TEXT("ACTIVE (accepted, not completed) satisfies the acceptance gate"), R->GetState(), EState::FreeExplore);
		TestEqual(TEXT("and the mission is still not completed"), R.N->GetMissionStatus(Mission()), EMRQuestStatus::Active);
	}
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Persist, "MoonRacer.OnboardingV2.Persistence.BoundaryWritesCorruptionAndInterruptedWrites", TestFlags)
bool FMRV2M_Persist::RunTest(const FString&)
{
	// corrupt newest checkpoint: recovery from the older valid one
	{ Setup(); FMRV2LoadReport Before; { FRig R; R->Begin(); R.Reach(); }
	  FMRCheckpointV2Store::Load(NoEv(), Before); const bool bNewestB = Before.ChosenSlot == TEXT("B");
	  const TArray<uint8> Junk = { 0xFF, 0x00, 0xAA, 0x55, 0x01 }; FFileHelper::SaveArrayToFile(Junk, *FMRProgressStore::SlotFilePath(bNewestB));
	  FRig R2; R2->Begin();
	  TestTrue(TEXT("corrupt newest slot: recovered from the older valid checkpoint (earlier generation)"), !R2->GetLoadReport().bFallbackFresh && R2->GetLoadReport().ChosenGeneration < Before.ChosenGeneration && R2->GetLoadReport().ChosenGeneration >= 1);
	  TestTrue(TEXT("the older checkpoint was the encounter-started marker: the interrupted encounter is recognised, restarted and completed"), R2->WasDialogueInterrupted() && R2->GetState() == EState::DepartureApproach && R2->GetRecord().Validate().Num() == 0);
	  TestTrue(TEXT("the corrupt file was preserved as evidence (backed up before being replaced)"), R2->BackupsCreated.ContainsByPredicate([](const FString& P) { TArray<uint8> B; FFileHelper::LoadFileToArray(B, *P); return B.Num() == 5; })); }
	// a torn write is reported, progress is kept in memory, and the next boundary persists everything
	{ Setup(); FRig R; R->Begin(); R->OnNotice.AddLambda([](const FString& T) { if (T.Contains(TEXT("checkpoint write failed"))) FMRCheckpointV2Store::GFailPoint = FMRCheckpointV2Store::EFailPoint::None; });
	  FMRCheckpointV2Store::GFailPoint = FMRCheckpointV2Store::EFailPoint::TornTargetWrite; R.Reach();
	  TestTrue(TEXT("one failed write is counted; the flow keeps going"), R->CheckpointFailures == 1 && R->GetState() == EState::DepartureApproach);
	  FRig R2; R2->Begin();
	  TestTrue(TEXT("after a torn write the next boundary's checkpoint is intact: a relaunch resumes where the first run was"), R2->GetState() == EState::DepartureApproach && R2->GetRecord().bTavianEncounterDone); }
	// persistent write failure (temp file left behind): the last good checkpoint survives
	{ Setup(); FRig R; R->Begin(); const FMRCheckpointV2 Good = R->GetRecord(); FMRCheckpointV2Store::GFailPoint = FMRCheckpointV2Store::EFailPoint::AfterTempWrite; R.Reach();
	  TestTrue(TEXT("every write fails: failures counted, in-memory progress continues"), R->CheckpointFailures >= 2 && R->GetRecord().bTavianEncounterDone);
	  FMRCheckpointV2Store::GFailPoint = FMRCheckpointV2Store::EFailPoint::None;
	  FRig R2; R2->Begin(); TestTrue(TEXT("a relaunch resumes from the last checkpoint that WAS written"), R2->GetState() == EState::TavernApproach && !R2->GetRecord().bTavianEncounterStarted && R2->GetRecord().Validate().Num() == 0); }
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Migration, "MoonRacer.OnboardingV2.Migration.LegacySlotsIntoTheMachine", TestFlags)
bool FMRV2M_Migration::RunTest(const FString&)
{
	for (int32 I = 0; I < (int32)EMROnboardingState::Count; ++I)
	{
		Setup(); const EMROnboardingState S = (EMROnboardingState)I; const FString Lbl = MROnboarding::StateId(S).ToString();
		const FMRProgressRecord V1 = V1At(S); WriteV1(false, V1, 1); const TArray<uint8> Before = Bytes(false);
		const FMRMigrationResult Mig = MROnboardingV2::MigrateV1ToV2(V1, NoEv());
		{ FMRV2LoadReport L; FMRCheckpointV2Store::Load(NoEv(), L); TestTrue(Lbl + TEXT(": a bare Load migrates in memory and writes/backs up nothing"), L.bMigrated && Bytes(false) == Before && !Exists(true) && NumBackups() == 0); }
		FRig R(true); TestTrue(Lbl + TEXT(": the machine begins"), R->Begin());
		TestTrue(Lbl + TEXT(": loaded as a migrated v1 checkpoint"), R->GetLoadReport().bMigrated && R->GetLoadReport().SourceVersion == 1);
		TestEqual(Lbl + TEXT(": resume target equals the pure migration's first incomplete state"), R->GetResumeTarget(), MROnboardingV2::FirstIncompleteState(Mig.Record));
		if (S == EMROnboardingState::FreeExplore)
		{
			TestTrue(Lbl + TEXT(": a legacy-completed player goes straight to FREE_EXPLORE, grandfathered, never asked to scan"), R->GetState() == EState::FreeExplore && R->GetRecord().bLegacyCompleted && R->GetRecord().PassportScanResult == EMRPassportScanResult::LegacyGrandfathered && !R->GetRecord().bCoreArrived && R.Sc->ScanCount == 0);
			TestTrue(Lbl + TEXT(": and nothing was written, nothing backed up, the v1 file is untouched"), R->CheckpointWrites == 0 && NumBackups() == 0 && Bytes(false) == Before && !Exists(true));
		}
		else
		{
			TestEqual(Lbl + TEXT(": starts at ACCESS_CHECK"), R->GetState(), EState::AccessCheck);
			TestTrue(Lbl + TEXT(": the FIRST v2 write preserved the v1 slot in a verified backup and left the v1 file untouched"), R->CheckpointWrites == 1 && NumBackups() == 1 && Bytes(false) == Before && [&]() { TArray<uint8> B; FFileHelper::LoadFileToArray(B, *FMRCheckpointV2Store::BackupPath(false, 0)); return B == Before; }());
		}
	}
	// approved evidence: the Tavian conversation is carried, not replayed
	{ Setup(); WriteV1(false, V1At(EMROnboardingState::FirstMission), 1);
	  FRig R(true); R->MigrationMap.TavianDialogueIds = { GraphAlpha() };
	  R->EvidenceProvider = []() { FMRSaveEvidence E; E.Narrative.bAvailable = true; E.Narrative.CompletedDialogues.Add(GraphAlpha()); return E; };
	  R->Begin(); TestTrue(TEXT("evidence-backed legacy progress: encounter carried"), R->GetRecord().bTavianEncounterDone && R->GetRecord().LegacyOrigin == EMRLegacyOrigin::V1Mapped);
	  Advance(R, 4); TestEqual(TEXT("after re-checks and the station the player skips the tavern and encounter (nothing replayed) and reaches the departure approach"), R->GetState(), EState::DepartureApproach);
	  TestTrue(TEXT("the carried encounter was not auto-completed by onboarding: it came from the migrated record, not from live narrative evidence"), R->GetRecord().Validate().Num() == 0); }
	// no narrative save / interrupted dialogue: the encounter restarts
	{ Setup(); WriteV1(false, V1At(EMROnboardingState::TavianDialogue), 1); FRig R(true); R->Begin(); Advance(R, 4);
	  TestTrue(TEXT("legacy interrupted dialogue: restarts from the tavern (no evidence)"), R->GetState() == EState::TavernApproach && !R->GetRecord().bTavianEncounterDone); }
	// corrupt/mixed
	{ Setup(); WriteV1(false, V1At(EMROnboardingState::AvatarCheck), 1); TArray<uint8> G; for (int32 K = 0; K < 200; ++K) G.Add((uint8)(K * 31 + 7)); FFileHelper::SaveArrayToFile(G, *FMRProgressStore::SlotFilePath(true));
	  FRig R(true); R->Begin();
	  TestTrue(TEXT("valid v1 + corrupt slot: migrated; the first write backed up BOTH files first"), R->GetLoadReport().bMigrated && NumBackups() == 2 && R->CheckpointWrites == 1);
	  TArray<uint8> K; FFileHelper::LoadFileToArray(K, *FMRCheckpointV2Store::BackupPath(true, 0)); TestTrue(TEXT("the corrupt file is preserved byte-for-byte as evidence"), K == G); }
	TearDown();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMRV2M_Mixed, "MoonRacer.OnboardingV2.Migration.MixedGenerationsAndCrossSaveConflicts", TestFlags)
bool FMRV2M_Mixed::RunTest(const FString&)
{
	// a v1 slot with a HIGHER generation than a valid v2 slot: v2 progress is kept, the conflict is reported, BOTH are preserved
	{ Setup();
	  FMRCheckpointV2 V2 = FMRCheckpointV2::MakeNew(); V2.bAccessResolved = V2.bIdentityResolved = V2.bAvatarConfirmed = V2.bStationEntered = V2.bTavernReached = true; V2.AvatarRef = TestRef(); V2.CurrentState = FName("TAVIAN_ENCOUNTER");
	  const FMRV2FixtureContent C; { FMRLocationSafeSpawn S; S.LocationId = C.StationLoc; S.SpawnPointId = C.StationSpawn; V2.SafeSpawns.Add(S); FMRLocationSafeSpawn T; T.LocationId = C.TavernLoc; T.SpawnPointId = C.TavernSpawn; V2.SafeSpawns.Add(T); }
	  TestTrue(TEXT("fixture v2 record valid"), V2.Validate().Num() == 0);
	  FMRCheckpointV2Store::WriteSlotV2ForTest(false, 2, V2); WriteV1(true, V1At(EMROnboardingState::AvatarCheck), 5);
	  const TArray<uint8> A = Bytes(false), B = Bytes(true);
	  { FMRV2LoadReport L; const FMRCheckpointV2 R = FMRCheckpointV2Store::Load(NoEv(), L);
	    TestTrue(TEXT("Load: v2 chosen despite the lower generation, conflict flagged, v1 migrated only for the report, nothing written"), L.SourceVersion == 2 && L.ChosenSlot == TEXT("A") && L.bMixedConflict && L.AlternateMigration.bOk && R == V2 && Bytes(false) == A && Bytes(true) == B && NumBackups() == 0);
	    TestTrue(TEXT("the conflict note names both generations"), L.Notes.ContainsByPredicate([](const FString& N) { return N.Contains(TEXT("CONFLICT")) && N.Contains(TEXT("generation 5")) && N.Contains(TEXT("generation 2")); })); }
	  FRig R(true); TArray<FString> Notices; R->OnNotice.AddLambda([&Notices](const FString& T) { Notices.Add(T); });
	  R->Begin();
	  TestTrue(TEXT("machine: v2 progress is the resume point (the v1 slot did NOT win)"), R->GetResumeTarget() == EState::TavianEncounter && R->GetLoadReport().bMixedConflict && !R->GetLoadReport().bMigrated);
	  TestTrue(TEXT("machine: the conflict was announced"), Notices.ContainsByPredicate([](const FString& T) { return T.Contains(TEXT("conflict")); }));
	  TestTrue(TEXT("the first write replaced the v1 slot only after backing it up byte-for-byte; the v2 slot is untouched"), R->CheckpointWrites == 1 && NumBackups() == 1 && Bytes(false) == A && [&]() { TArray<uint8> K; FFileHelper::LoadFileToArray(K, *FMRCheckpointV2Store::BackupPath(true, 0)); return K == B; }());
	  FMRV2LoadReport L2; FMRCheckpointV2Store::Load(NoEv(), L2); TestTrue(TEXT("afterwards the newest checkpoint is native v2 with no conflict"), L2.SourceVersion == 2 && !L2.bMixedConflict); }
	// an OLDER valid v1 slot next to a v2 slot is not a conflict
	{ Setup(); FMRCheckpointV2 V2 = FMRCheckpointV2::MakeNew(); FMRCheckpointV2Store::WriteSlotV2ForTest(false, 4, V2); WriteV1(true, V1At(EMROnboardingState::AvatarCheck), 1);
	  FMRV2LoadReport L; FMRCheckpointV2Store::Load(NoEv(), L); TestTrue(TEXT("older v1: v2 used, no conflict flagged, both preserved"), L.SourceVersion == 2 && !L.bMixedConflict && NumBackups() == 0); }
	// narrative evidence says the Tavian conversation is done, onboarding does not: reported, NEVER auto-advanced, one-time effects never replayed
	{ Setup(); FRig R; R.Narrative();
	  R.N->StateForTest().CompletedDialogues.Add(GraphAlpha()); R.N->StateForTest().FiredEffects.Add(FxMet()); R.N->StateForTest().Facts.Add(FactMet());
	  R->MigrationMap.TavianDialogueIds = { GraphAlpha() }; R->MigrationMap.TavianEncounterEffectIds = { FxMet(), FxOffer(), FxAccept() };
	  R->Begin();
	  TestTrue(TEXT("reconciliation reports the disagreement"), R->GetConsistency().Has(TEXT("NARRATIVE_TAVIAN_DONE_ONB_NOT")));
	  TestTrue(TEXT("onboarding did NOT advance on that evidence"), R->GetState() == EState::TavernApproach && !R->GetRecord().bTavianEncounterDone && !R->GetRecord().bTavernReached);
	  R.ReachNarr(R->Content.TavernObjective);
	  TestTrue(TEXT("the encounter is played, not skipped: the dialogue's returning branch runs"), R->GetState() == EState::TavianEncounter && R.N->GetRuntime()->IsActive());
	  TestTrue(TEXT("the one-time effect already in the ledger is not replayed"), R.N->EffectsApplied == 0 && R.N->EffectsSuppressed == 1);
	  Drive(R.N.Get(), {}); TestEqual(TEXT("it completes normally"), R->GetState(), EState::DepartureApproach);
	  TestTrue(TEXT("mission status untouched by the replay"), R.N->GetMissionStatus(Mission()) == EMRQuestStatus::NotOffered); }
	// the v1 store never reads or overwrites a v2 file (downgrade protection) and default slots never exist
	{ Setup(); { FRig R; R->Begin(); R.Reach(); }
	  FMRProgressLoadReport P; const FMRProgressRecord V1R = FMRProgressStore::Load(P);
	  TestTrue(TEXT("the live v1 loader treats the v2 files as newer: starts fresh, loads nothing"), P.bFallbackFresh && P.bRejectedNewerVersion && V1R.CurrentState == FName("START"));
	  const TArray<uint8> A = Bytes(false), B = Bytes(true); const FMRProgressSaveResult SR = FMRProgressStore::Save(FMRProgressRecord::MakeNew()); TestFalse(TEXT("the v1 store refuses to overwrite a v2 slot"), SR.bOk);
	  TestTrue(TEXT("both v2 files unchanged by the v1 attempt"), Bytes(false) == A && Bytes(true) == B);
	  FMRProgressStore::SetSlotBaseOverride(FMRCheckpointV2Store::DefaultSlotBase());
	  TestFalse(TEXT("no default player slot exists"), IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(false)) || IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(true)));
	  FMRProgressStore::SetSlotBaseOverride(Base); }
	TearDown();
	return true;
}

} // namespace MROnboardingV2MachineTestUnit

#endif // WITH_DEV_AUTOMATION_TESTS
