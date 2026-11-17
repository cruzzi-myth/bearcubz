// Moon Racer - onboarding foundation automation tests (Phase 3B P4). Run:
//   UnrealEditor-Cmd MoonRacer.uproject -ExecCmds="Automation RunTests MoonRacer.Onboarding; Quit" -unattended -nullrhi
// All content is TEST FIXTURE - NONCANON. Dedicated slots only; default player saves are never touched.
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Avatar/MRAvatarSaveGame.h"
#include "Engine/GameInstance.h"
#include "HAL/FileManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Onboarding/MROnboardingSubsystem.h"
#include "UObject/StrongObjectPtr.h"

namespace
{
	constexpr EAutomationTestFlags TestFlags = EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;
	const TCHAR* TestBase = TEXT("MRProgress_AutomationTest");

	struct FFixture
	{
		TStrongObjectPtr<UGameInstance> GI;
		TStrongObjectPtr<UMROnboardingSubsystem> S;
		UMRDevAvatarFlowService* Avatar() const { return Cast<UMRDevAvatarFlowService>(S->AvatarService); }
		UMRDevPassportService* Passport() const { return Cast<UMRDevPassportService>(S->PassportService); }
		UMRDevWorldService* World() const { return Cast<UMRDevWorldService>(S->WorldService); }
		UMRDevSpawnService* Spawn() const { return Cast<UMRDevSpawnService>(S->SpawnService); }
		UMRDevCinematicService* Cine() const { return Cast<UMRDevCinematicService>(S->CinematicService); }
		UMRDevInteractionService* Interact() const { return Cast<UMRDevInteractionService>(S->InteractionService); }
		UMRDevDialogueService* Dialogue() const { return Cast<UMRDevDialogueService>(S->DialogueService); }
		UMRDevQuestService* Quest() const { return Cast<UMRDevQuestService>(S->QuestService); }
	};

	FFixture MakeFixture()
	{
		FFixture F;
		F.GI.Reset(NewObject<UGameInstance>(GetTransientPackage()));
		F.S.Reset(NewObject<UMROnboardingSubsystem>(F.GI.Get()));
		F.S->UseDevServices(nullptr);
		return F;
	}

	void CleanSlots()
	{
		FMRProgressStore::SetSlotBaseOverride(TestBase);
		FMRProgressStore::DeleteBoth();
	}

	FMRAvatarRef Ref(const FGuid& Id = FGuid::NewGuid(), int32 Rev = 2) { FMRAvatarRef R; R.AvatarId = Id; R.Revision = Rev; return R; }

	// A consistent record that has completed everything before `Next` (so the player is about to do `Next`).
	FMRProgressRecord RecordAt(EMROnboardingState Next, const FMRAvatarRef& Avatar = Ref())
	{
		FMRProgressRecord R = FMRProgressRecord::MakeNew();
		auto Done = [&](EMROnboardingState S) { return (int32)S < (int32)Next; };
		R.Flags.bAccessResolved = Done(EMROnboardingState::AccessCheck);
		R.Flags.bPassportChecked = Done(EMROnboardingState::PassportCheck);
		R.Flags.bAvatarConfirmed = Done(EMROnboardingState::AvatarCheck);
		R.Flags.bArrivalSeen = Done(EMROnboardingState::ArrivalCinematic);
		R.Flags.bCoreSpawned = Done(EMROnboardingState::CoreSpawn);
		R.Flags.bFirstObjectiveDone = Done(EMROnboardingState::FirstObjective);
		R.Flags.bTavianIntroduced = Done(EMROnboardingState::TavianDialogue);
		R.Flags.bBartenderHandoff = Done(EMROnboardingState::BartenderHandoff);
		if (R.Flags.bBartenderHandoff) R.Flags.FirstQuestStatus = EMRQuestStatus::Offered;
		if (R.Flags.bAvatarConfirmed) R.AvatarRef = Avatar;
		if (R.Flags.bCoreSpawned) { R.LastSafeSpawn.MapId = FName("TEST_FIXTURE_NONCANON_LOCATION"); R.LastSafeSpawn.SpawnPointId = FName("TEST_FIXTURE_NONCANON_SPAWN_SAVED"); }
		R.CurrentState = MROnboarding::StateId(Next);
		return R;
	}

	TArray<FString> StatesEntered(const UMROnboardingSubsystem* S)
	{
		TArray<FString> Out;
		for (const FString& L : S->TransitionLog) { int32 I = L.Find(TEXT(" -> ")); if (I != INDEX_NONE && !L.StartsWith(TEXT("REJECT"))) { FString To = L.Mid(I + 4); int32 J = To.Find(TEXT(" on ")); Out.Add(J != INDEX_NONE ? To.Left(J) : To); } }
		return Out;
	}

	bool FileBytes(bool bB, TArray<uint8>& Out) { return FFileHelper::LoadFileToArray(Out, *FMRProgressStore::SlotFilePath(bB)); }

	void WriteRawSlot(bool bB, int32 Version, int32 Gen, const FMRProgressRecord& Rec, bool bGoodChecksum = true)
	{
		UMRProgressSaveGame* S = NewObject<UMRProgressSaveGame>(GetTransientPackage());
		S->SaveVersion = Version; S->WriteGeneration = Gen; S->Record = Rec;
		S->Checksum = bGoodChecksum ? FMRProgressStore::ComputeChecksum(Gen, Rec) : 12345;
		FMRProgressStore::WriteSlotForTest(bB, S);
	}

	// Run a fixture all the way: avatar present, everything auto-completes.
	void GiveAvatar(FFixture& F) { F.Avatar()->ForcedRef = Ref(); }
}

// ---------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbSpineTest, "MoonRacer.Onboarding.Flow.SpineDefinition", TestFlags)
bool FMROnbSpineTest::RunTest(const FString&)
{
	const TArray<FString> Expected = { TEXT("START"), TEXT("ACCESS_CHECK"), TEXT("PASSPORT_CHECK"), TEXT("AVATAR_CHECK"), TEXT("ARRIVAL_CINEMATIC"), TEXT("CORE_SPAWN"),
		TEXT("FIRST_OBJECTIVE"), TEXT("TAVIAN_DIALOGUE"), TEXT("BARTENDER_HANDOFF"), TEXT("FIRST_MISSION"), TEXT("FREE_EXPLORE") };
	const TArray<EMROnboardingState>& Spine = MROnboarding::Spine();
	TestEqual(TEXT("11 states"), Spine.Num(), 11);
	TSet<int32> Events;
	for (int32 i = 0; i < Spine.Num(); ++i)
	{
		TestEqual(*FString::Printf(TEXT("state %d id"), i), MROnboarding::StateId(Spine[i]).ToString(), Expected[i]);
		EMROnboardingState P; TestTrue(TEXT("parse round trip"), MROnboarding::ParseState(MROnboarding::StateId(Spine[i]), P) && P == Spine[i]);
		if (i > 0 && i < Spine.Num() - 1) Events.Add((int32)MROnboarding::ExitEventFor(Spine[i]));
	}
	TestEqual(TEXT("each non-terminal state has its own exit event"), Events.Num(), 9);
	EMROnboardingState Tmp;
	TestFalse(TEXT("state IDs are exact (case-sensitive)"), MROnboarding::ParseState(FName("avatar_check"), Tmp));
	TestFalse(TEXT("unknown state rejected"), MROnboarding::ParseState(FName("NOPE"), Tmp));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbFreshTest, "MoonRacer.Onboarding.Flow.FreshOnboardingReachesFreeExplore", TestFlags)
bool FMROnbFreshTest::RunTest(const FString&)
{
	CleanSlots();
	FFixture F = MakeFixture();
	F.S->Begin();
	TestEqual(TEXT("no avatar yet: waits at AVATAR_CHECK"), F.S->GetState(), EMROnboardingState::AvatarCheck);
	TestEqual(TEXT("Avatar Creator requested once"), F.Avatar()->CreatorOpenCount, 1);
	TestFalse(TEXT("not blocked, just waiting"), F.S->IsBlocked());

	FMRAvatarAppearance A; A.AvatarId = FGuid::NewGuid(); A.Revision = 2; A.SpeciesId = FName("human");
	F.S->NotifyAvatarSaved(A); // Avatar Creator completion
	TestEqual(TEXT("reaches FREE_EXPLORE with fixtures"), F.S->GetState(), EMROnboardingState::FreeExplore);

	const TArray<FString> Expected = { TEXT("ACCESS_CHECK"), TEXT("PASSPORT_CHECK"), TEXT("AVATAR_CHECK"), TEXT("ARRIVAL_CINEMATIC"), TEXT("CORE_SPAWN"), TEXT("FIRST_OBJECTIVE"),
		TEXT("TAVIAN_DIALOGUE"), TEXT("BARTENDER_HANDOFF"), TEXT("FIRST_MISSION"), TEXT("FREE_EXPLORE") };
	TestEqual(TEXT("states entered in spine order, none repeated"), StatesEntered(F.S.Get()), Expected);
	const FMRProgressRecord& R = F.S->GetRecord();
	TestTrue(TEXT("completed"), R.Flags.bOnboardingCompleted);
	TestTrue(TEXT("mission ACCEPTED -> Active (D-6), not Completed"), R.Flags.FirstQuestStatus == EMRQuestStatus::Active);
	TestTrue(TEXT("avatar reference stored (not appearance)"), R.AvatarRef.AvatarId == A.AvatarId && R.AvatarRef.Revision == 2);
	TestTrue(TEXT("safe spawn recorded"), R.LastSafeSpawn.IsSet());
	TestTrue(TEXT("record valid"), R.Validate().Num() == 0);
	TestEqual(TEXT("one checkpoint per transition (10 edges)"), F.S->CheckpointWrites, 10);
	TestEqual(TEXT("no checkpoint failures"), F.S->CheckpointFailures, 0);
	FMRProgressLoadReport L; const FMRProgressRecord Loaded = FMRProgressStore::Load(L);
	TestTrue(TEXT("persisted record equals in-memory record"), Loaded == R);
	TestEqual(TEXT("quest accepted exactly once"), F.Quest()->AcceptCount, 1);
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbRejectTest, "MoonRacer.Onboarding.Flow.RejectsInvalidAndOutOfOrderTransitions", TestFlags)
bool FMROnbRejectTest::RunTest(const FString&)
{
	CleanSlots();
	FFixture F = MakeFixture();
	TestFalse(TEXT("events before Begin rejected"), F.S->HandleEvent(EMROnboardingEvent::AccessResolved).bAccepted);
	F.S->Begin(); // waits at AVATAR_CHECK
	const int32 Writes = F.S->CheckpointWrites; const int32 Rej0 = F.S->RejectedEvents;
	const EMROnboardingState Before = F.S->GetState();
	TestEqual(TEXT("at AVATAR_CHECK"), Before, EMROnboardingState::AvatarCheck);
	for (EMROnboardingEvent E : { EMROnboardingEvent::SessionStarted, EMROnboardingEvent::ReturningPlayer, EMROnboardingEvent::AccessResolved, EMROnboardingEvent::PassportChecked, EMROnboardingEvent::ArrivalFinished,
		EMROnboardingEvent::CoreReady, EMROnboardingEvent::ObjectiveReached, EMROnboardingEvent::FirstContactDone, EMROnboardingEvent::HandoffDone, EMROnboardingEvent::MissionAccepted })
	{
		const FMRTransitionResult R = F.S->HandleEvent(E);
		TestFalse(*FString::Printf(TEXT("%s rejected in AVATAR_CHECK"), *MROnboarding::EventName(E).ToString()), R.bAccepted);
	}
	TestEqual(TEXT("state unchanged after rejections"), F.S->GetState(), Before);
	TestEqual(TEXT("no checkpoint written by rejected events"), F.S->CheckpointWrites, Writes);
	TestEqual(TEXT("rejections counted"), F.S->RejectedEvents - Rej0, 10);
	FMREventPayload NoRef;
	TestFalse(TEXT("AvatarConfirmed without a reference rejected"), F.S->HandleEvent(EMROnboardingEvent::AvatarConfirmed, NoRef).bAccepted);

	GiveAvatar(F);
	FMRAvatarAppearance A; A.AvatarId = FGuid::NewGuid(); F.S->NotifyAvatarSaved(A);
	TestEqual(TEXT("completes"), F.S->GetState(), EMROnboardingState::FreeExplore);
	TestFalse(TEXT("terminal state accepts nothing"), F.S->HandleEvent(EMROnboardingEvent::MissionAccepted).bAccepted);
	TestFalse(TEXT("duplicate/late event rejected"), F.S->HandleEvent(EMROnboardingEvent::AvatarConfirmed, FMREventPayload()).bAccepted);

	// ReturningPlayer is only legal for a completed record (fresh machine on an incomplete save).
	CleanSlots();
	FFixture G = MakeFixture();
	G.S->Begin();
	TestFalse(TEXT("ReturningPlayer outside START rejected"), G.S->HandleEvent(EMROnboardingEvent::ReturningPlayer).bAccepted);

	// Determinism: the same inputs produce the same transition sequence.
	auto Run = []() { CleanSlots(); FFixture X = MakeFixture(); X.S->Begin(); FMRAvatarAppearance Ap; Ap.AvatarId = FGuid(1, 2, 3, 4); X.S->NotifyAvatarSaved(Ap); return StatesEntered(X.S.Get()); };
	TestEqual(TEXT("deterministic transitions"), Run(), Run());
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbOfflineTest, "MoonRacer.Onboarding.Flow.OfflineOperationAndIdentity", TestFlags)
bool FMROnbOfflineTest::RunTest(const FString&)
{
	CleanSlots();
	{
		FFixture F = MakeFixture(); GiveAvatar(F);
		TestTrue(TEXT("passport placeholder is the offline fixture"), F.Passport() != nullptr && F.Passport()->Status == EMRPassportStatus::OfflineGuest);
		F.S->Begin();
		TestEqual(TEXT("offline completes with no account"), F.S->GetState(), EMROnboardingState::FreeExplore);
		TestTrue(TEXT("identity mode offline guest"), F.S->GetRecord().IdentityMode == EMRIdentityMode::OfflineGuest);
		TestTrue(TEXT("no server subject id"), F.S->GetRecord().OpaqueSubjectId.IsEmpty());
	}
	CleanSlots();
	{
		FFixture F = MakeFixture(); GiveAvatar(F);
		F.Passport()->Status = EMRPassportStatus::Error; // identity service failure
		F.S->Begin();
		TestEqual(TEXT("identity failure blocks at PASSPORT_CHECK"), F.S->GetState(), EMROnboardingState::PassportCheck);
		TestTrue(TEXT("blocked with a reason"), F.S->IsBlocked() && F.S->IsBlockRetryable());
		TestFalse(TEXT("no progress claimed"), F.S->GetRecord().Flags.bPassportChecked);
		TestTrue(TEXT("player can explicitly continue offline"), F.S->ContinueOffline());
		TestEqual(TEXT("then completes"), F.S->GetState(), EMROnboardingState::FreeExplore);
	}
	CleanSlots();
	{
		FFixture F = MakeFixture(); GiveAvatar(F);
		F.Passport()->Status = EMRPassportStatus::NoPassport; // online-only status; PASSPORT_HANDOFF is deferred (D-8)
		F.S->Begin();
		TestTrue(TEXT("blocked, not retryable (no handoff in v1)"), F.S->IsBlocked() && !F.S->IsBlockRetryable());
		TestTrue(TEXT("handoff state does not exist"), F.S->GetState() == EMROnboardingState::PassportCheck);
		F.S->ContinueOffline();
		TestEqual(TEXT("continues offline"), F.S->GetState(), EMROnboardingState::FreeExplore);
		TestTrue(TEXT("OnlineLinked never set"), F.S->GetRecord().IdentityMode == EMRIdentityMode::OfflineGuest);
	}
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbMissingContentTest, "MoonRacer.Onboarding.Flow.MissingCoreContentBlocksSafely", TestFlags)
bool FMROnbMissingContentTest::RunTest(const FString&)
{
	CleanSlots();
	FFixture F = MakeFixture(); GiveAvatar(F);
	F.World()->bAvailable = false; // Core content missing
	F.S->Begin();
	TestEqual(TEXT("stops at CORE_SPAWN"), F.S->GetState(), EMROnboardingState::CoreSpawn);
	TestTrue(TEXT("blocked + retryable"), F.S->IsBlocked() && F.S->IsBlockRetryable());
	TestTrue(TEXT("reason names the cause"), F.S->GetBlockReason().Contains(TEXT("Core content unavailable")));
	TestFalse(TEXT("spawn flag not set"), F.S->GetRecord().Flags.bCoreSpawned);
	TestFalse(TEXT("no safe spawn invented"), F.S->GetRecord().LastSafeSpawn.IsSet());
	const int32 W = F.S->CheckpointWrites;
	F.S->Retry(); TestTrue(TEXT("still blocked while content is missing"), F.S->IsBlocked());
	TestEqual(TEXT("blocked retries write no checkpoints"), F.S->CheckpointWrites, W);
	FMRProgressLoadReport L; const FMRProgressRecord Disk = FMRProgressStore::Load(L);
	TestFalse(TEXT("nothing about CORE_SPAWN persisted"), Disk.Flags.bCoreSpawned);

	F.World()->bAvailable = true; F.S->Retry();
	TestEqual(TEXT("recovers once content exists"), F.S->GetState(), EMROnboardingState::FreeExplore);
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbNpcTest, "MoonRacer.Onboarding.Flow.UnavailableNpcsAndDialogueBlockSafely", TestFlags)
bool FMROnbNpcTest::RunTest(const FString&)
{
	CleanSlots();
	{
		FFixture F = MakeFixture(); GiveAvatar(F);
		F.Interact()->UnavailableNpcs.Add(F.S->Content.FirstContactNpcId);
		F.S->Begin();
		TestEqual(TEXT("blocked at TAVIAN_DIALOGUE"), F.S->GetState(), EMROnboardingState::TavianDialogue);
		TestTrue(TEXT("reason: NPC unavailable"), F.S->IsBlocked() && F.S->GetBlockReason().Contains(TEXT("NPC unavailable")));
		TestFalse(TEXT("not introduced"), F.S->GetRecord().Flags.bTavianIntroduced);
		TestEqual(TEXT("no dialogue ran"), F.Dialogue()->RunCount, 0);
		F.Interact()->UnavailableNpcs.Empty(); F.S->Retry();
		TestEqual(TEXT("resumes when NPC exists"), F.S->GetState(), EMROnboardingState::FreeExplore);
	}
	CleanSlots();
	{
		FFixture F = MakeFixture(); GiveAvatar(F);
		F.Dialogue()->UnavailableGraphs.Add(F.S->Content.HandoffDialogueId);
		F.S->Begin();
		TestEqual(TEXT("blocked at BARTENDER_HANDOFF on missing dialogue"), F.S->GetState(), EMROnboardingState::BartenderHandoff);
		TestTrue(TEXT("tavian part stayed done"), F.S->GetRecord().Flags.bTavianIntroduced && !F.S->GetRecord().Flags.bBartenderHandoff);
		TestTrue(TEXT("quest not offered"), F.S->GetRecord().Flags.FirstQuestStatus == EMRQuestStatus::NotOffered);
	}
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbCinematicTest, "MoonRacer.Onboarding.Flow.ArrivalCinematicOutcomes", TestFlags)
bool FMROnbCinematicTest::RunTest(const FString&)
{
	CleanSlots();
	{
		FFixture F = MakeFixture(); GiveAvatar(F); F.Cine()->bAvailable = false;
		F.S->Begin();
		TestEqual(TEXT("unavailable cinematic does not block"), F.S->GetState(), EMROnboardingState::FreeExplore);
		TestTrue(TEXT("recorded as skipped-unavailable"), F.S->GetRecord().Flags.bArrivalSkippedUnavailable);
		TestFalse(TEXT("NOT recorded as seen"), F.S->GetRecord().Flags.bArrivalSeen);
		TestTrue(TEXT("record still valid"), F.S->GetRecord().Validate().Num() == 0);
	}
	CleanSlots();
	{
		FFixture F = MakeFixture(); GiveAvatar(F); F.Cine()->bPlayerSkips = true;
		F.S->Begin();
		TestTrue(TEXT("player skip counts as seen"), F.S->GetRecord().Flags.bArrivalSeen && !F.S->GetRecord().Flags.bArrivalSkippedUnavailable);
	}
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbMissionTest, "MoonRacer.Onboarding.Flow.FirstMissionAcceptedEntersFreeExplore", TestFlags)
bool FMROnbMissionTest::RunTest(const FString&)
{
	CleanSlots();
	FFixture F = MakeFixture(); GiveAvatar(F);
	F.Quest()->bAvailable = false; // test mission fixture not yet available
	F.S->Begin();
	TestEqual(TEXT("waits at FIRST_MISSION"), F.S->GetState(), EMROnboardingState::FirstMission);
	TestTrue(TEXT("mission is only Offered"), F.S->GetRecord().Flags.FirstQuestStatus == EMRQuestStatus::Offered);
	TestFalse(TEXT("not completed"), F.S->GetRecord().Flags.bOnboardingCompleted);
	F.Quest()->bAvailable = true; F.S->Retry();
	TestEqual(TEXT("acceptance (not completion) enters FREE_EXPLORE"), F.S->GetState(), EMROnboardingState::FreeExplore);
	TestTrue(TEXT("status Active, never Completed by onboarding"), F.S->GetRecord().Flags.FirstQuestStatus == EMRQuestStatus::Active);
	TestTrue(TEXT("onboarding completed"), F.S->GetRecord().Flags.bOnboardingCompleted);
	CleanSlots();
	return true;
}

// ---------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbABTest, "MoonRacer.Onboarding.Persistence.AlternatingSlotsMonotonicGeneration", TestFlags)
bool FMROnbABTest::RunTest(const FString&)
{
	CleanSlots();
	FMRProgressRecord R = FMRProgressRecord::MakeNew(); R.Flags.bAccessResolved = true; R.CurrentState = FName("PASSPORT_CHECK");
	TArray<FString> Slots; TArray<int32> Gens;
	for (int32 i = 0; i < 6; ++i)
	{
		const FMRProgressSaveResult S = FMRProgressStore::Save(R);
		TestTrue(*FString::Printf(TEXT("save %d ok"), i), S.bOk);
		Slots.Add(S.Slot); Gens.Add(S.Generation);
	}
	TestEqual(TEXT("alternates A/B"), Slots, TArray<FString>({ TEXT("A"), TEXT("B"), TEXT("A"), TEXT("B"), TEXT("A"), TEXT("B") }));
	TestEqual(TEXT("generations strictly increase"), Gens, TArray<int32>({ 1, 2, 3, 4, 5, 6 }));
	FMRProgressLoadReport L; const FMRProgressRecord Loaded = FMRProgressStore::Load(L);
	TestTrue(TEXT("both slots valid"), L.bValidA && L.bValidB);
	TestEqual(TEXT("latest wins"), L.ChosenGeneration, 6);
	TestEqual(TEXT("latest slot is B"), L.ChosenSlot, FString(TEXT("B")));
	TestTrue(TEXT("round trip"), Loaded == R);
	TestFalse(TEXT("inconsistent record refused at save time"), [&]() { FMRProgressRecord Bad = R; Bad.Flags.bCoreSpawned = true; return FMRProgressStore::Save(Bad).bOk; }());
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbInvalidTest, "MoonRacer.Onboarding.Persistence.InvalidCheckpointRecovery", TestFlags)
bool FMROnbInvalidTest::RunTest(const FString&)
{
	CleanSlots();
	const FMRProgressRecord Good = RecordAt(EMROnboardingState::AvatarCheck);
	FMRProgressRecord Newer = RecordAt(EMROnboardingState::ArrivalCinematic);
	WriteRawSlot(false, 1, 1, Good);
	WriteRawSlot(true, 1, 2, Newer);
	FMRProgressLoadReport L; FMRProgressRecord R = FMRProgressStore::Load(L);
	TestEqual(TEXT("newest valid chosen"), L.ChosenSlot, FString(TEXT("B")));

	// Newest slot holds an inconsistent record (valid checksum, impossible flags): recover from the latest VALID one.
	FMRProgressRecord Bad = Newer; Bad.Flags.bCoreSpawned = true; // later flag with an earlier one missing/no spawn
	WriteRawSlot(true, 1, 3, Bad);
	R = FMRProgressStore::Load(L);
	TestFalse(TEXT("inconsistent slot rejected"), L.bValidB);
	TestEqual(TEXT("recovered from older valid checkpoint"), L.ChosenSlot, FString(TEXT("A")));
	TestTrue(TEXT("recovered record is the older one"), R == Good);
	TestTrue(TEXT("the invalid file is preserved, not deleted"), IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(true)));

	// Both invalid: safe fallback to a fresh record.
	WriteRawSlot(false, 1, 4, Bad);
	R = FMRProgressStore::Load(L);
	TestTrue(TEXT("fallback fresh when both invalid"), L.bFallbackFresh && !L.bValidA && !L.bValidB);
	TestTrue(TEXT("fresh record starts at START"), R.CurrentState == FName("START") && !R.Flags.bAccessResolved);
	TestTrue(TEXT("both bad files preserved"), IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(false)) && IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(true)));

	// A new save after fallback keeps generations monotonic (above the readable-but-invalid ones).
	const FMRProgressSaveResult S = FMRProgressStore::Save(FMRProgressRecord::MakeNew());
	TestTrue(TEXT("saving after fallback works"), S.bOk);
	TestTrue(TEXT("generation above every readable generation"), S.Generation > 4);
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbCorruptTest, "MoonRacer.Onboarding.Persistence.CorruptedCheckpointRecovery", TestFlags)
bool FMROnbCorruptTest::RunTest(const FString&)
{
	CleanSlots();
	const FMRProgressRecord Good = RecordAt(EMROnboardingState::ArrivalCinematic);
	FMRProgressStore::Save(Good); FMRProgressStore::Save(Good); // A gen1, B gen2
	FMRProgressLoadReport L;

	// 1) Truncated/garbage file in the newest slot.
	const TArray<uint8> Junk = { 0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x13, 0x37 };
	FFileHelper::SaveArrayToFile(Junk, *FMRProgressStore::SlotFilePath(true));
	FMRProgressRecord R = FMRProgressStore::Load(L);
	TestFalse(TEXT("garbage slot invalid"), L.bValidB);
	TestEqual(TEXT("recovers from the other slot"), L.ChosenSlot, FString(TEXT("A")));
	TestTrue(TEXT("data intact"), R == Good);

	// 2) Tampered content: flag flipped without recomputing the checksum.
	CleanSlots(); FMRProgressStore::Save(Good); FMRProgressStore::Save(Good);
	WriteRawSlot(true, 1, 2, RecordAt(EMROnboardingState::BartenderHandoff), /*bGoodChecksum*/ false);
	R = FMRProgressStore::Load(L);
	TestFalse(TEXT("checksum mismatch rejected"), L.bValidB);
	TestEqual(TEXT("falls back to A"), L.ChosenSlot, FString(TEXT("A")));
	TestTrue(TEXT("notes explain"), L.Notes.ContainsByPredicate([](const FString& N) { return N.Contains(TEXT("checksum")); }));

	// 2b) A single flipped bit inside the payload of an otherwise valid file (envelope CRC catches it).
	CleanSlots(); FMRProgressStore::Save(Good); FMRProgressStore::Save(Good);
	{ TArray<uint8> Bytes; FileBytes(true, Bytes); if (Bytes.Num() > 40) { Bytes[Bytes.Num() / 2] ^= 0x01; FFileHelper::SaveArrayToFile(Bytes, *FMRProgressStore::SlotFilePath(true)); } }
	R = FMRProgressStore::Load(L);
	TestFalse(TEXT("bit-flipped payload rejected"), L.bValidB);
	TestEqual(TEXT("recovers from the other slot"), L.ChosenSlot, FString(TEXT("A")));
	{ TArray<uint8> Bytes; FileBytes(false, Bytes); Bytes.SetNum(Bytes.Num() / 2); FFileHelper::SaveArrayToFile(Bytes, *FMRProgressStore::SlotFilePath(false)); } // truncated
	R = FMRProgressStore::Load(L);
	TestTrue(TEXT("truncated + bit-flipped -> fresh fallback, no crash"), L.bFallbackFresh);

	// 3) Both corrupted.
	FFileHelper::SaveArrayToFile(Junk, *FMRProgressStore::SlotFilePath(false));
	R = FMRProgressStore::Load(L);
	TestTrue(TEXT("both corrupt -> fresh fallback"), L.bFallbackFresh);
	TestTrue(TEXT("never crashes; a usable record returned"), R.Validate().Num() == 0);
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbMigrationTest, "MoonRacer.Onboarding.Persistence.SaveVersionMigration", TestFlags)
bool FMROnbMigrationTest::RunTest(const FString&)
{
	CleanSlots();
	// v0 (legacy, test-defined): stage index + one flag. Stage 3 = AVATAR_CHECK (consistent after migration).
	UMRProgressSaveGame* Old = NewObject<UMRProgressSaveGame>(GetTransientPackage());
	Old->SaveVersion = 0; Old->WriteGeneration = 1; Old->LegacyStageIndex = 3; Old->bLegacyArrivalSeen = false;
	FMRProgressStore::WriteSlotForTest(false, Old);
	FMRProgressLoadReport L; FMRProgressRecord R = FMRProgressStore::Load(L);
	TestTrue(TEXT("v0 migrated"), L.bMigrated && L.bValidA);
	TestTrue(TEXT("state carried over"), R.CurrentState == FName("AVATAR_CHECK"));
	TestTrue(TEXT("derived completion flags"), R.Flags.bAccessResolved && R.Flags.bPassportChecked && !R.Flags.bAvatarConfirmed);
	TestTrue(TEXT("migrated record is valid"), R.Validate().Num() == 0);
	const FMRProgressSaveResult S = FMRProgressStore::Save(R);
	TestTrue(TEXT("re-saved at current version"), S.bOk && S.Slot == TEXT("B") && S.Generation == 2);

	// A later-stage v0 save cannot be fully migrated (v0 never stored an avatar ref / safe spawn): safe fallback, never fabricated.
	CleanSlots();
	Old = NewObject<UMRProgressSaveGame>(GetTransientPackage());
	Old->SaveVersion = 0; Old->LegacyStageIndex = 7; Old->bLegacyArrivalSeen = true;
	FMRProgressStore::WriteSlotForTest(false, Old);
	R = FMRProgressStore::Load(L);
	TestTrue(TEXT("incomplete legacy data falls back safely"), L.bFallbackFresh);
	TestTrue(TEXT("legacy file preserved"), IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(false)));
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbFutureTest, "MoonRacer.Onboarding.Persistence.NewerVersionNeverOverwritten", TestFlags)
bool FMROnbFutureTest::RunTest(const FString&)
{
	CleanSlots();
	WriteRawSlot(false, MROnboarding::CurrentProgressVersion + 5, 9, RecordAt(EMROnboardingState::TavianDialogue)); // from a newer build
	WriteRawSlot(true, 1, 3, RecordAt(EMROnboardingState::AvatarCheck));
	TArray<uint8> Before; FileBytes(false, Before);
	FMRProgressLoadReport L; const FMRProgressRecord R = FMRProgressStore::Load(L);
	TestTrue(TEXT("newer-version save flagged"), L.bRejectedNewerVersion);
	TestEqual(TEXT("uses the supported slot"), L.ChosenSlot, FString(TEXT("B")));
	const FMRProgressSaveResult S = FMRProgressStore::Save(R);
	TestFalse(TEXT("refuses to overwrite the newer-version slot"), S.bOk);
	TArray<uint8> After; FileBytes(false, After);
	TestTrue(TEXT("newer-version file untouched"), Before == After && Before.Num() > 0);
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbWriteFailTest, "MoonRacer.Onboarding.Persistence.WriteFailureKeepsProgressInMemory", TestFlags)
bool FMROnbWriteFailTest::RunTest(const FString&)
{
	CleanSlots();
	// Both slots belong to a newer build, so every checkpoint write is refused. Onboarding must keep working in memory.
	WriteRawSlot(false, MROnboarding::CurrentProgressVersion + 2, 4, FMRProgressRecord::MakeNew());
	WriteRawSlot(true, MROnboarding::CurrentProgressVersion + 2, 5, FMRProgressRecord::MakeNew());
	TArray<uint8> A0, B0; FileBytes(false, A0); FileBytes(true, B0);
	FFixture F = MakeFixture(); GiveAvatar(F);
	F.S->Begin();
	TestTrue(TEXT("fell back to a fresh record"), F.S->GetLoadReport().bFallbackFresh);
	TestEqual(TEXT("flow still completes in memory"), F.S->GetState(), EMROnboardingState::FreeExplore);
	TestTrue(TEXT("every checkpoint failed and was reported"), F.S->CheckpointFailures > 0 && F.S->CheckpointWrites == 0);
	TArray<uint8> A1, B1; FileBytes(false, A1); FileBytes(true, B1);
	TestTrue(TEXT("newer-version files untouched"), A0 == A1 && B0 == B1);
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbSeparationTest, "MoonRacer.Onboarding.Persistence.SeparateFromAvatarAndDefaultSaves", TestFlags)
bool FMROnbSeparationTest::RunTest(const FString&)
{
	CleanSlots();
	UMRAvatarSaveSubsystem::SetSlotNameOverride(TEXT("MRAvatar_OnbAutomation"));
	auto Snap = [](const FString& Name) { const FString P = FPaths::ProjectSavedDir() / TEXT("SaveGames") / (Name + TEXT(".sav")); TArray<uint8> B; const bool bEx = FFileHelper::LoadFileToArray(B, *P); return TPair<bool, int32>(bEx, bEx ? (int32)FCrc::MemCrc32(B.GetData(), B.Num()) : 0); };
	const auto DefA = Snap(TEXT("MRProgress_Local_A")), DefB = Snap(TEXT("MRProgress_Local_B")), DefAv = Snap(TEXT("MRAvatar_Local"));
	// an avatar save that onboarding must never modify
	UMRAvatarSaveGame* AvSave = NewObject<UMRAvatarSaveGame>(GetTransientPackage()); AvSave->Appearance.SpeciesId = FName("human"); AvSave->Appearance.AvatarId = FGuid::NewGuid();
	UGameplayStatics::SaveGameToSlot(AvSave, UMRAvatarSaveSubsystem::GetSlotName(), 0);
	const auto AvBefore = Snap(UMRAvatarSaveSubsystem::GetSlotName());

	FFixture F = MakeFixture(); GiveAvatar(F); F.S->Begin();
	TestEqual(TEXT("flow ran"), F.S->GetState(), EMROnboardingState::FreeExplore);
	TestTrue(TEXT("avatar save byte-identical"), Snap(UMRAvatarSaveSubsystem::GetSlotName()) == AvBefore);
	TestTrue(TEXT("default progress slots untouched"), Snap(TEXT("MRProgress_Local_A")) == DefA && Snap(TEXT("MRProgress_Local_B")) == DefB);
	TestTrue(TEXT("default avatar slot untouched"), Snap(TEXT("MRAvatar_Local")) == DefAv);
	TestTrue(TEXT("progress writes went to the dedicated test slots"), FMRProgressStore::SlotBase() == TestBase && IFileManager::Get().FileExists(*FMRProgressStore::SlotFilePath(false)));

	// No Passport/credential fields anywhere in the progress record.
	const FString Text = F.S->GetRecord().ToCanonicalString().ToLower();
	for (const TCHAR* Bad : { TEXT("passport"), TEXT("supabase"), TEXT("token"), TEXT("password"), TEXT("email"), TEXT("secret") }) TestFalse(*FString::Printf(TEXT("progress has no '%s'"), Bad), Text.Contains(Bad));
	FMRProgressRecord Rec = F.S->GetRecord(); Rec.OpaqueSubjectId = TEXT("server-id");
	TestTrue(TEXT("a server identity in the record is rejected in v1"), Rec.Validate().Num() > 0);
	UGameplayStatics::DeleteGameInSlot(UMRAvatarSaveSubsystem::GetSlotName(), 0);
	CleanSlots();
	return true;
}

// ---------------------------------------------------------------------------------------------------------------
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbResumeMatrixTest, "MoonRacer.Onboarding.Resume.EveryInterruptionPoint", TestFlags)
bool FMROnbResumeMatrixTest::RunTest(const FString&)
{
	for (int32 i = (int32)EMROnboardingState::AccessCheck; i <= (int32)EMROnboardingState::FirstMission; ++i)
	{
		const EMROnboardingState Interrupted = (EMROnboardingState)i;
		CleanSlots();
		const FMRAvatarRef AvRef = Ref();
		FMRProgressStore::Save(RecordAt(Interrupted, AvRef));
		FFixture F = MakeFixture(); F.Avatar()->ForcedRef = AvRef; // avatar still valid and unchanged
		F.S->Begin();
		const FString Label = MROnboarding::StateId(Interrupted).ToString();
		TestEqual(*FString::Printf(TEXT("resume after interruption at %s reaches FREE_EXPLORE"), *Label), F.S->GetState(), EMROnboardingState::FreeExplore);

		const TArray<FString> Entered = StatesEntered(F.S.Get());
		TestTrue(*FString::Printf(TEXT("%s: access + identity re-resolved on resume"), *Label), Entered.Contains(TEXT("ACCESS_CHECK")) && Entered.Contains(TEXT("PASSPORT_CHECK")));
		TestTrue(*FString::Printf(TEXT("%s: spine order preserved (no state entered out of order)"), *Label), [&]() { int32 Last = -1; for (const FString& N : Entered) { EMROnboardingState P; if (!MROnboarding::ParseState(FName(*N), P)) return false; if ((int32)P <= Last) return false; Last = (int32)P; } return true; }());
		// Never repeats completed work.
		if (Interrupted > EMROnboardingState::AvatarCheck) TestEqual(*FString::Printf(TEXT("%s: avatar creator not reopened"), *Label), F.Avatar()->CreatorOpenCount, 0);
		if (Interrupted > EMROnboardingState::ArrivalCinematic) TestEqual(*FString::Printf(TEXT("%s: cinematic not replayed"), *Label), F.Cine()->PlayCount, 0);
		if (Interrupted > EMROnboardingState::FirstObjective) TestFalse(*FString::Printf(TEXT("%s: objective not repeated"), *Label), Entered.Contains(TEXT("FIRST_OBJECTIVE")));
		if (Interrupted > EMROnboardingState::TavianDialogue) TestFalse(*FString::Printf(TEXT("%s: first dialogue not repeated"), *Label), Entered.Contains(TEXT("TAVIAN_DIALOGUE")));
		if (Interrupted > EMROnboardingState::CoreSpawn) // the level must be reloaded and the avatar respawned at the saved safe spawn first
		{
			TestTrue(*FString::Printf(TEXT("%s: CORE_SPAWN re-run first"), *Label), Entered.Contains(TEXT("CORE_SPAWN")));
			TestEqual(*FString::Printf(TEXT("%s: respawned at the recorded safe spawn"), *Label), F.Spawn()->LastRequestedSpawn, FName("TEST_FIXTURE_NONCANON_SPAWN_SAVED"));
		}
		// The interrupted state itself is (re)entered.
		if (Interrupted != EMROnboardingState::AccessCheck && Interrupted != EMROnboardingState::PassportCheck) TestTrue(*FString::Printf(TEXT("%s: interrupted state resumed"), *Label), Entered.Contains(Label));
		TestTrue(*FString::Printf(TEXT("%s: final record valid"), *Label), F.S->GetRecord().Validate().Num() == 0);
	}
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbReturningTest, "MoonRacer.Onboarding.Resume.ReturningPlayerSkipsEverything", TestFlags)
bool FMROnbReturningTest::RunTest(const FString&)
{
	CleanSlots();
	{
		FFixture F = MakeFixture(); GiveAvatar(F); F.S->Begin();
		TestEqual(TEXT("first run completes"), F.S->GetState(), EMROnboardingState::FreeExplore);
	}
	FFixture G = MakeFixture(); // relaunch: new process-equivalent, same slots, avatar still valid
	G.Avatar()->ForcedRef = FMRAvatarRef(); // intentionally unset: a returning player must not even consult the avatar
	G.S->Begin();
	TestEqual(TEXT("goes straight to FREE_EXPLORE"), G.S->GetState(), EMROnboardingState::FreeExplore);
	TestEqual(TEXT("only START -> FREE_EXPLORE happened"), StatesEntered(G.S.Get()), TArray<FString>({ TEXT("FREE_EXPLORE") }));
	TestEqual(TEXT("no services used"), G.World()->LoadCount + G.Cine()->PlayCount + G.Interact()->InteractCount + G.Quest()->AcceptCount, 0);
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbAvatarRefTest, "MoonRacer.Onboarding.Resume.AvatarReferenceRestoration", TestFlags)
bool FMROnbAvatarRefTest::RunTest(const FString&)
{
	const FMRAvatarRef Original = Ref();
	// (a) same avatar still valid -> AVATAR_CHECK is passed without opening the creator.
	{
		CleanSlots(); FMRProgressStore::Save(RecordAt(EMROnboardingState::FirstObjective, Original));
		FFixture F = MakeFixture(); F.Avatar()->ForcedRef = Original; F.S->Begin();
		TestEqual(TEXT("same avatar: completes"), F.S->GetState(), EMROnboardingState::FreeExplore);
		TestEqual(TEXT("creator not opened"), F.Avatar()->CreatorOpenCount, 0);
		TestTrue(TEXT("reference preserved"), F.S->GetRecord().AvatarRef == Original);
	}
	// (b) the avatar was deleted: later progress is KEPT, the creator reopens, progress resumes after it is confirmed again.
	{
		CleanSlots(); FMRProgressStore::Save(RecordAt(EMROnboardingState::TavianDialogue, Original));
		FFixture F = MakeFixture(); // no ForcedRef -> no valid avatar
		F.S->Begin();
		TestEqual(TEXT("waits at AVATAR_CHECK"), F.S->GetState(), EMROnboardingState::AvatarCheck);
		TestEqual(TEXT("creator opened"), F.Avatar()->CreatorOpenCount, 1);
		TestTrue(TEXT("later progress NOT reset"), F.S->GetRecord().Flags.bFirstObjectiveDone && F.S->GetRecord().Flags.bCoreSpawned);
		FMRAvatarAppearance A; A.AvatarId = FGuid::NewGuid(); A.Revision = 7;
		F.S->NotifyAvatarSaved(A);
		TestEqual(TEXT("then resumes and completes"), F.S->GetState(), EMROnboardingState::FreeExplore);
		TestTrue(TEXT("reference refreshed to the new avatar"), F.S->GetRecord().AvatarRef.AvatarId == A.AvatarId && F.S->GetRecord().AvatarRef.Revision == 7);
		TestFalse(TEXT("first objective not repeated"), StatesEntered(F.S.Get()).Contains(TEXT("FIRST_OBJECTIVE")));
	}
	// (c) the avatar was replaced by another one: reference is refreshed without a creator round trip.
	{
		CleanSlots(); FMRProgressStore::Save(RecordAt(EMROnboardingState::TavianDialogue, Original));
		FFixture F = MakeFixture(); const FMRAvatarRef Replaced = Ref(FGuid::NewGuid(), 5); F.Avatar()->ForcedRef = Replaced; F.S->Begin();
		TestEqual(TEXT("replaced avatar: completes"), F.S->GetState(), EMROnboardingState::FreeExplore);
		TestTrue(TEXT("reference follows the current avatar"), F.S->GetRecord().AvatarRef == Replaced);
		TestEqual(TEXT("creator not opened"), F.Avatar()->CreatorOpenCount, 0);
	}
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbRecoveryTest, "MoonRacer.Onboarding.Resume.StuckPlayerSafeSpawnRecovery", TestFlags)
bool FMROnbRecoveryTest::RunTest(const FString&)
{
	CleanSlots();
	FFixture F = MakeFixture(); F.Interact()->bAutoComplete = false; // player is out in the world at FIRST_OBJECTIVE
	GiveAvatar(F); F.S->Begin();
	TestEqual(TEXT("waiting at FIRST_OBJECTIVE"), F.S->GetState(), EMROnboardingState::FirstObjective);
	TestTrue(TEXT("safe spawn recorded at CORE_SPAWN"), F.S->GetRecord().LastSafeSpawn.IsSet());
	TestTrue(TEXT("recovery teleports to the safe spawn"), F.S->RecoverToSafeSpawn());
	TestEqual(TEXT("spawn service used"), F.Spawn()->TeleportCount, 1);
	TestEqual(TEXT("state unchanged by recovery"), F.S->GetState(), EMROnboardingState::FirstObjective);
	F.Interact()->NotifyObjectiveReached();
	TestEqual(TEXT("objective then completes the flow"), F.S->GetState(), EMROnboardingState::FreeExplore);

	CleanSlots();
	FFixture G = MakeFixture(); G.Avatar()->ForcedRef = FMRAvatarRef(); G.S->Begin(); // stuck before any safe spawn exists
	TestFalse(TEXT("no safe spawn yet -> recovery declines"), G.S->RecoverToSafeSpawn());
	CleanSlots();
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FMROnbFixtureMarkingTest, "MoonRacer.Onboarding.Fixtures.AllContentMarkedNoncanon", TestFlags)
bool FMROnbFixtureMarkingTest::RunTest(const FString&)
{
	const FMRFlowContent C;
	for (const FName& Id : { C.ArrivalCinematicId, C.CoreLocationId, C.DefaultSpawnId, C.ObjectiveId, C.FirstContactNpcId, C.FirstContactDialogueId, C.HandoffNpcId, C.HandoffDialogueId, C.FirstMissionId })
		TestTrue(*FString::Printf(TEXT("%s is a fixture ID"), *Id.ToString()), Id.ToString().StartsWith(TEXT("TEST_FIXTURE_NONCANON_")));
	TestTrue(TEXT("dialogue fixture text is marked"), UMRDevDialogueService::FixtureLine().StartsWith(TEXT("TEST FIXTURE - NONCANON")));
	const FMRContentVersions V;
	TestEqual(TEXT("content versions unresolved until canon is approved"), V.CoreManifestVersion, FName("unresolved"));
	CleanSlots();
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
