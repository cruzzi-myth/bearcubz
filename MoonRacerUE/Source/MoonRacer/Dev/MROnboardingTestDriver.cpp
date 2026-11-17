#include "Dev/MROnboardingTestDriver.h"
#include "Avatar/MRAvatarCustomizationComponent.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/GameInstance.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/FileManager.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Onboarding/MROnboardingSubsystem.h"
#include "MoonRacer.h"

AMROnboardingTestDriver::AMROnboardingTestDriver() { PrimaryActorTick.bCanEverTick = true; }
UMROnboardingSubsystem* AMROnboardingTestDriver::Onb() const { return GetGameInstance() ? GetGameInstance()->GetSubsystem<UMROnboardingSubsystem>() : nullptr; }
AMRPlayerCharacter* AMROnboardingTestDriver::Pawn() const { return Cast<AMRPlayerCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)); }

void AMROnboardingTestDriver::Check(const FString& Name, bool bPass, const FString& Detail)
{
	(bPass ? NumPass : NumFail)++;
	UE_LOG(LogMoonRacer, Display, TEXT("MRONB|CHECK|%s|%s|%s"), bPass ? TEXT("PASS") : TEXT("FAIL"), *Name, *Detail);
}

void AMROnboardingTestDriver::Finish()
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRONB|RESULT|%s|%s|pass=%d|fail=%d"), *Mode, NumFail == 0 ? TEXT("PASS") : TEXT("FAIL"), NumPass, NumFail);
	UKismetSystemLibrary::QuitGame(this, UGameplayStatics::GetPlayerController(this, 0), EQuitPreference::Quit, false);
}

void AMROnboardingTestDriver::BeginPlay()
{
	Super::BeginPlay();
	if (!FParse::Value(FCommandLine::Get(), TEXT("MROnbTest="), Mode) || Mode.IsEmpty()) { SetActorTickEnabled(false); return; }
	if (FMRProgressStore::SlotBase() == TEXT("MRProgress_Local") || UMRAvatarSaveSubsystem::GetSlotName() == TEXT("MRAvatar_Local"))
	{
		// Never let a dev test write to the real player slots.
		UE_LOG(LogMoonRacer, Error, TEXT("MRONB|REFUSED|dev test mode needs dedicated slots (-MRProgressSlot=... -MRAvatarSlot=...); refusing to touch the default player slots"));
		SetActorTickEnabled(false); return;
	}
	if (Mode == TEXT("partial")) BuildPartial(); else if (Mode == TEXT("resume")) BuildResume();
	else if (Mode == TEXT("returning")) BuildReturning(); else if (Mode == TEXT("corrupt")) BuildCorrupt();
	else { SetActorTickEnabled(false); return; }
	bRunning = true;
	UE_LOG(LogMoonRacer, Display, TEXT("MRONB|BEGIN|mode=%s|progressSlot=%s|avatarSlot=%s"), *Mode, *FMRProgressStore::SlotBase(), *UMRAvatarSaveSubsystem::GetSlotName());
}

void AMROnboardingTestDriver::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!bRunning) return;
	StepTimer += Dt;
	if (StepIndex >= Steps.Num()) { bRunning = false; Finish(); return; }
	if (StepTimer >= Steps[StepIndex].Delay) { StepTimer = 0.f; const int32 I = StepIndex++; Steps[I].Fn(); }
}

static void ConfigureFixtures(UMROnboardingSubsystem* S, UWorld* W, bool bManualObjective)
{
	S->UseDevServices(W);
	if (UMRDevInteractionService* I = Cast<UMRDevInteractionService>(S->InteractionService)) I->bAutoComplete = !bManualObjective;
}

// ---------------------------------------------------------------------------------------------------------------
void AMROnboardingTestDriver::BuildPartial()
{
	Steps.Add({1.5f, [this]()
	{
		UMROnboardingSubsystem* S = Onb(); AMRPlayerCharacter* P = Pawn();
		Check(TEXT("Partial_SubsystemAndPawn"), S != nullptr && P != nullptr && P->AvatarCustomization && P->AvatarCustomization->HasApplied());
		if (!S || !P) { StepIndex = Steps.Num(); return; }
		PawnStart = P->GetActorLocation();
		ConfigureFixtures(S, GetWorld(), /*manual objective*/ true);
		S->Begin();
		Check(TEXT("Partial_FreshStartsAtAvatarCheck"), S->GetState() == EMROnboardingState::AvatarCheck && S->GetLoadReport().bFallbackFresh, S->GetDebugString());
	}});
	Steps.Add({0.5f, [this]()
	{
		// Avatar Creator completion through the REAL avatar-saved event (direct function call stands in for the UI Confirm click).
		UMROnboardingSubsystem* S = Onb(); AMRPlayerCharacter* P = Pawn();
		FMRAvatarAppearance A = P->AvatarCustomization->GetCurrentAppearance();
		A.BodyBaseId = FName("dev_quinn"); A.SpeciesId = FName("mythraxian"); A.Revision = 2;
		const FMRAvatarApplyResult R = P->AvatarCustomization->PreviewAppearance(A); P->AvatarCustomization->CommitCurrent();
		UMRAvatarSaveSubsystem* AvSave = GetGameInstance()->GetSubsystem<UMRAvatarSaveSubsystem>();
		FString Err; const bool bSaved = AvSave->SaveAppearance(P->AvatarCustomization->GetCurrentAppearance(), Err);
		Check(TEXT("Partial_AvatarSavedViaRealEvent"), R.bApplied && bSaved, Err);
		Check(TEXT("Partial_ProgressPausedAtFirstObjective"), S->GetState() == EMROnboardingState::FirstObjective && !S->IsBlocked(), S->GetDebugString());
		Check(TEXT("Partial_AvatarReferenceStoredNotAppearance"), S->GetRecord().AvatarRef.AvatarId == P->AvatarCustomization->GetCurrentAppearance().AvatarId && S->GetRecord().AvatarRef.Revision == 2);
		Check(TEXT("Partial_SafeSpawnRecorded"), S->GetRecord().LastSafeSpawn.IsSet() && S->GetRecord().Flags.bCoreSpawned);
		Check(TEXT("Partial_CheckpointsWritten"), S->CheckpointWrites >= 6 && S->CheckpointFailures == 0, FString::FromInt(S->CheckpointWrites));
	}});
	Steps.Add({0.3f, [this]()
	{
		UMROnboardingSubsystem* S = Onb(); AMRPlayerCharacter* P = Pawn();
		P->SetActorLocation(PawnStart + FVector(4000.f, 0.f, 600.f)); // pretend the player wandered off / got stuck
		const bool bOk = S->RecoverToSafeSpawn();
		Check(TEXT("Partial_StuckPlayerRecoveryMovesPawn"), bOk && FVector::Dist2D(P->GetActorLocation(), PawnStart) < 1000.f, FString::Printf(TEXT("dist=%.0f"), FVector::Dist2D(P->GetActorLocation(), PawnStart)));
		Check(TEXT("Partial_StateUnchangedByRecovery"), S->GetState() == EMROnboardingState::FirstObjective);
		UE_LOG(LogMoonRacer, Display, TEXT("MRONB|INTERRUPT|quitting mid-onboarding at %s"), *MROnboarding::StateId(S->GetState()).ToString());
	}});
	Steps.Add({0.3f, [this]() { Finish(); }});
}

void AMROnboardingTestDriver::BuildResume()
{
	Steps.Add({1.5f, [this]()
	{
		UMROnboardingSubsystem* S = Onb(); AMRPlayerCharacter* P = Pawn();
		if (!S || !P) { Check(TEXT("Resume_Setup"), false); StepIndex = Steps.Num(); return; }
		ConfigureFixtures(S, GetWorld(), true);
		S->Begin();
		const FMRProgressLoadReport& L = S->GetLoadReport();
		Check(TEXT("Resume_LoadedLatestValidCheckpoint"), !L.bFallbackFresh && L.ChosenGeneration >= 1, FString::Printf(TEXT("slot=%s gen=%d"), *L.ChosenSlot, L.ChosenGeneration));
		Check(TEXT("Resume_ResumedAtFirstObjective"), S->GetState() == EMROnboardingState::FirstObjective, S->GetDebugString());
		UMRDevCinematicService* Cine = Cast<UMRDevCinematicService>(S->CinematicService);
		UMRDevSpawnService* Spawn = Cast<UMRDevSpawnService>(S->SpawnService);
		UMRDevAvatarFlowService* AvSvc = Cast<UMRDevAvatarFlowService>(S->AvatarService);
		Check(TEXT("Resume_NoCinematicReplay"), Cine && Cine->PlayCount == 0);
		Check(TEXT("Resume_AvatarCreatorNotReopened"), AvSvc && AvSvc->CreatorOpenCount == 0);
		Check(TEXT("Resume_RespawnedAtRecordedSafeSpawn"), Spawn && Spawn->SpawnCount == 1 && Spawn->LastRequestedSpawn == S->GetRecord().LastSafeSpawn.SpawnPointId, Spawn ? Spawn->LastRequestedSpawn.ToString() : TEXT("-"));
		// Avatar reference restoration + the avatar itself restored on the spawned pawn.
		Check(TEXT("Resume_AvatarRestoredOnPawn"), P->AvatarCustomization->GetCurrentAppearance().BodyBaseId == FName("dev_quinn") && P->GetMesh()->GetSkeletalMeshAsset() && P->GetMesh()->GetSkeletalMeshAsset()->GetName() == TEXT("SKM_Quinn_Simple"));
		Check(TEXT("Resume_AvatarReferenceMatchesAvatarSave"), S->GetRecord().AvatarRef.AvatarId == P->AvatarCustomization->GetCurrentAppearance().AvatarId, S->GetRecord().AvatarRef.AvatarId.ToString());
	}});
	Steps.Add({0.4f, [this]()
	{
		UMROnboardingSubsystem* S = Onb();
		Cast<UMRDevInteractionService>(S->InteractionService)->NotifyObjectiveReached(); // player reaches the (fixture) objective
		Check(TEXT("Resume_CompletesToFreeExplore"), S->GetState() == EMROnboardingState::FreeExplore, S->GetDebugString());
		Check(TEXT("Resume_MissionAcceptedNotCompleted"), S->GetRecord().Flags.FirstQuestStatus == EMRQuestStatus::Active && S->GetRecord().Flags.bOnboardingCompleted);
		Check(TEXT("Resume_NoCheckpointFailures"), S->CheckpointFailures == 0);
		Check(TEXT("Resume_FullPathOrdered"), S->TransitionLog.ContainsByPredicate([](const FString& L) { return L.Contains(TEXT("FIRST_MISSION -> FREE_EXPLORE")); }));
	}});
	Steps.Add({0.3f, [this]() { Finish(); }});
}

void AMROnboardingTestDriver::BuildReturning()
{
	Steps.Add({1.5f, [this]()
	{
		UMROnboardingSubsystem* S = Onb();
		if (!S) { Check(TEXT("Returning_Setup"), false); StepIndex = Steps.Num(); return; }
		ConfigureFixtures(S, GetWorld(), false);
		S->Begin();
		Check(TEXT("Returning_ImmediateFreeExplore"), S->GetState() == EMROnboardingState::FreeExplore, S->GetDebugString());
		Check(TEXT("Returning_NoServicesUsed"), S->TransitionLog.Num() <= 3 && Cast<UMRDevWorldService>(S->WorldService)->LoadCount == 0);
		Check(TEXT("Returning_AvatarStillRestored"), Pawn() && Pawn()->AvatarCustomization->GetCurrentAppearance().BodyBaseId == FName("dev_quinn"));
	}});
	Steps.Add({0.3f, [this]() { Finish(); }});
}

void AMROnboardingTestDriver::BuildCorrupt()
{
	Steps.Add({1.0f, [this]()
	{
		UMROnboardingSubsystem* S = Onb();
		if (!S) { Check(TEXT("Corrupt_Setup"), false); StepIndex = Steps.Num(); return; }
		// Identify the newest checkpoint, then corrupt that file on disk before onboarding loads.
		FMRProgressLoadReport Before; FMRProgressStore::Load(Before);
		const bool bNewestB = Before.ChosenSlot == TEXT("B");
		Check(TEXT("Corrupt_TwoCheckpointsExist"), Before.bValidA && Before.bValidB, FString::Printf(TEXT("A=%d B=%d"), Before.bValidA, Before.bValidB));
		const TArray<uint8> Junk = { 0xFF, 0x00, 0xAA, 0x55, 0x01 };
		FFileHelper::SaveArrayToFile(Junk, *FMRProgressStore::SlotFilePath(bNewestB));
		ConfigureFixtures(S, GetWorld(), true);
		S->Begin();
		const FMRProgressLoadReport& L = S->GetLoadReport();
		Check(TEXT("Corrupt_NewestRejected"), bNewestB ? !L.bValidB : !L.bValidA);
		Check(TEXT("Corrupt_RecoveredFromOlderValidCheckpoint"), !L.bFallbackFresh && L.ChosenGeneration >= 1 && L.ChosenGeneration < Before.ChosenGeneration, FString::Printf(TEXT("chosen gen %d (was %d)"), L.ChosenGeneration, Before.ChosenGeneration));
		Check(TEXT("Corrupt_NoCrashAndFlowRunning"), S->GetState() != EMROnboardingState::Start, S->GetDebugString());
		Check(TEXT("Corrupt_ProgressNotInvented"), S->GetRecord().Validate().Num() == 0);
	}});
	Steps.Add({0.3f, [this]() { Finish(); }});
}
