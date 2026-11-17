#include "Dev/MROnboardingV2TestDriver.h"
#include "Avatar/MRAvatarCustomizationComponent.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Components/StaticMeshComponent.h"
#include "Dev/MRNarrativeFixtures.h"
#include "Engine/GameInstance.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/TextRenderActor.h"
#include "Components/TextRenderComponent.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Narrative/MRDialogueRuntime.h"
#include "Narrative/MRInteraction.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "Onboarding/MRDevOnboardingServices.h"
#include "Onboarding/MROnboardingV2Machine.h"
#include "Onboarding/MROnboardingV2Subsystem.h"
#include "MoonRacer.h"

using namespace MRNarrativeFixtures;
using EState = EMROnboardingStateV2;

AMROnboardingV2TestDriver::AMROnboardingV2TestDriver() { PrimaryActorTick.bCanEverTick = true; }
AMRPlayerCharacter* AMROnboardingV2TestDriver::Pawn() const { return Cast<AMRPlayerCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)); }

void AMROnboardingV2TestDriver::Check(const FString& Name, bool bPass, const FString& Detail)
{
	(bPass ? NumPass : NumFail)++;
	UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|CHECK|%s|%s|%s"), bPass ? TEXT("PASS") : TEXT("FAIL"), *Name, *Detail);
}

void AMROnboardingV2TestDriver::Finish()
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|RESULT|%s|%s|pass=%d|fail=%d"), *Mode, NumFail == 0 ? TEXT("PASS") : TEXT("FAIL"), NumPass, NumFail);
	UKismetSystemLibrary::QuitGame(this, UGameplayStatics::GetPlayerController(this, 0), EQuitPreference::Quit, false);
}

void AMROnboardingV2TestDriver::BeginPlay()
{
	Super::BeginPlay();
	Mode = RequestedMode;
	if (Mode.IsEmpty() || !MROnboardingV2Dev::IsAllowed()) { SetActorTickEnabled(false); return; }
	if (FMRProgressStore::SlotBase() == FMRCheckpointV2Store::DefaultSlotBase() || UMRAvatarSaveSubsystem::GetSlotName() == TEXT("MRAvatar_Local") || FMRNarrativeStore::IsDefaultSlot())
	{
		UE_LOG(LogMoonRacer, Error, TEXT("MRONBV2|REFUSED|dev test mode needs dedicated slots (-MRProgressSlot=... -MRAvatarSlot=... -MRNarrativeSlot=...); refusing to touch the default player slots"));
		SetActorTickEnabled(false); return;
	}
	if (Mode == TEXT("partial")) BuildPartial(); else if (Mode == TEXT("resume")) BuildResume(); else if (Mode == TEXT("returning")) BuildReturning();
	else { SetActorTickEnabled(false); return; }
	bRunning = true;
	UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|BEGIN|mode=%s|progressSlot=%s|avatarSlot=%s|narrativeSlot=%s"), *Mode, *FMRProgressStore::SlotBase(), *UMRAvatarSaveSubsystem::GetSlotName(), *FMRNarrativeStore::SlotBase());
}

void AMROnboardingV2TestDriver::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!bRunning) return;
	StepTimer += Dt;
	if (StepIndex >= Steps.Num()) { bRunning = false; Finish(); return; }
	if (StepTimer >= Steps[StepIndex].Delay) { StepTimer = 0.f; const int32 I = StepIndex++; Steps[I].Fn(); }
}

float AMROnboardingV2TestDriver::DistTo(FName SpawnId) const
{
	const FVector* A = Anchors.Find(SpawnId); AMRPlayerCharacter* P = Pawn();
	return (A && P) ? FVector::Dist2D(P->GetActorLocation(), *A) : 1.0e9f;
}

void AMROnboardingV2TestDriver::BuildGraybox()
{
	const FMRV2FixtureContent C;
	struct FPlace { FName Spawn; FVector At; const TCHAR* Label; };
	const TArray<FPlace> Places = {
		{ C.StationSpawn, FVector(0.f, 0.f, 6050.f), TEXT("TEST_FIXTURE_NONCANON GRAYBOX: STATION") },
		{ C.TavernSpawn, FVector(4000.f, 0.f, 6050.f), TEXT("TEST_FIXTURE_NONCANON GRAYBOX: TAVERN APPROACH") },
		{ C.DepartureSpawn, FVector(8000.f, 0.f, 6050.f), TEXT("TEST_FIXTURE_NONCANON GRAYBOX: DEPARTURE TERMINAL") },
		{ C.CoreSpawn, FVector(12000.f, 0.f, 6050.f), TEXT("TEST_FIXTURE_NONCANON GRAYBOX: CORE ARRIVAL") } };
	UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	for (const FPlace& P : Places)
	{
		Anchors.Add(P.Spawn, P.At);
		if (AStaticMeshActor* Slab = GetWorld()->SpawnActor<AStaticMeshActor>(FVector(P.At.X, P.At.Y, P.At.Z - 50.f), FRotator::ZeroRotator))
		{
			Slab->GetStaticMeshComponent()->SetMobility(EComponentMobility::Movable); Slab->GetStaticMeshComponent()->SetStaticMesh(Cube); Slab->SetActorScale3D(FVector(30.f, 30.f, 1.f));
			Slab->GetStaticMeshComponent()->SetCollisionProfileName(TEXT("BlockAll"));
		}
		if (ATextRenderActor* T = GetWorld()->SpawnActor<ATextRenderActor>(P.At + FVector(0.f, 0.f, 300.f), FRotator::ZeroRotator)) T->GetTextRender()->SetText(FText::FromString(P.Label));
	}
}

bool AMROnboardingV2TestDriver::Setup(bool bLoadNarrative)
{
	UGameInstance* GI = GetGameInstance(); AMRPlayerCharacter* P = Pawn();
	UMROnboardingV2Subsystem* Sub = GI ? GI->GetSubsystem<UMROnboardingV2Subsystem>() : nullptr;
	Nar = GI ? GI->GetSubsystem<UMRNarrativeSubsystem>() : nullptr;
	Check(TEXT("Setup_SubsystemsAndPawn"), Sub && Nar && P && P->AvatarCustomization && P->AvatarCustomization->HasApplied());
	if (!Sub || !Nar || !P) return false;
	Machine = Sub->GetMachine();
	if (FParse::Param(FCommandLine::Get(), TEXT("MRNarrativeFresh"))) FMRNarrativeStore::Delete();   // dedicated slot only (guarded above)
	RegisterStrings(); FMRNarrativeBundle B = Build(GI); FMRValidationReport Rep;
	Check(TEXT("Setup_FixtureNarrativeRegistered"), Nar->RegisterBundle(B, FMRValidationPolicy(), Rep), Rep.Summary());
	if (bLoadNarrative) Nar->LoadState();
	BuildGraybox();
	const FMRV2FixtureContent C;
	for (const TPair<FName, FVector>& A : Anchors) { /* anchors are owned by the spawn service below */ }
	Machine->UseDevServices(GetWorld());
	UMRDevV2SpawnService* Sp = Cast<UMRDevV2SpawnService>(Machine->SpawnService); Sp->Anchors = Anchors;
	MRNarrative::BindOnboardingV2(Machine, Nar, GI->GetSubsystem<UMRAvatarSaveSubsystem>());
	Machine->BindAvatarSaveEvents(GI->GetSubsystem<UMRAvatarSaveSubsystem>());
	FMRDepartureCondition D1; D1.Type = EMRDepartureConditionType::DialogueCompleted; D1.Subject = GraphAlpha();
	FMRDepartureCondition D2; D2.Type = EMRDepartureConditionType::MissionAccepted; D2.Subject = Mission();   // SYNTHETIC fixture conditions
	Machine->Content.Departure.bResolved = true; Machine->Content.Departure.Conditions = { D1, D2 };
	Machine->MigrationMap.TavianDialogueIds = { GraphAlpha() };
	// fixture NPCs on the tavern graybox slab
	const FVector Tav = Anchors[C.TavernSpawn];
	auto Npc = [&](FName Id, FVector Off) { AMRDevNpcActor* N = GetWorld()->SpawnActorDeferred<AMRDevNpcActor>(AMRDevNpcActor::StaticClass(), FTransform(Tav + Off + FVector(0.f, 0.f, 100.f))); if (N) { N->NpcId = Id; N->FinishSpawning(FTransform(Tav + Off + FVector(0.f, 0.f, 100.f))); } return N; };
	Npc(NpcAlpha(), FVector(600.f, 0.f, 0.f)); Npc(NpcBeta(), FVector(600.f, 800.f, 0.f));
	Interactor = NewObject<UMRInteractorComponent>(P); Interactor->bCreateHud = false; Interactor->RegisterComponent();
	PawnStart = P->GetActorLocation();
	return true;
}

// ---------------------------------------------------------------------------------------------------------------
void AMROnboardingV2TestDriver::BuildPartial()
{
	Add(1.5f, [this]()
	{
		if (!Setup(/*LoadNarrative*/ true)) { StepIndex = Steps.Num(); return; }
		FString Why; Machine->Begin(&Why);
		Check(TEXT("Partial_V2BeginsFresh"), Machine->HasBegun() && Machine->GetLoadReport().bFallbackFresh && Machine->GetState() == EState::AvatarCheck, Machine->GetDebugString());
		Check(TEXT("Partial_LaunchIdentityResolvedWithoutAScan"), Machine->GetRecord().bIdentityResolved && Machine->GetRecord().PassportScanResult == EMRPassportScanResult::NotScanned);
	});
	Add(0.5f, [this]()
	{
		// Avatar Creator completion through the REAL avatar-saved event
		AMRPlayerCharacter* P = Pawn();
		FMRAvatarAppearance A = P->AvatarCustomization->GetCurrentAppearance();
		A.BodyBaseId = FName("dev_quinn"); A.SpeciesId = FName("mythraxian"); A.Revision = 2;
		const FMRAvatarApplyResult R = P->AvatarCustomization->PreviewAppearance(A); P->AvatarCustomization->CommitCurrent();
		UMRAvatarSaveSubsystem* AvSave = GetGameInstance()->GetSubsystem<UMRAvatarSaveSubsystem>();
		FString Err; const bool bSaved = AvSave->SaveAppearance(P->AvatarCustomization->GetCurrentAppearance(), Err);
		Check(TEXT("Partial_AvatarSavedViaRealEvent"), R.bApplied && bSaved, Err);
		Check(TEXT("Partial_StationEnteredThenTavernApproach"), Machine->GetState() == EState::TavernApproach && Machine->GetRecord().bStationEntered && !Machine->IsBlocked(), Machine->GetDebugString());
		Check(TEXT("Partial_PawnPlacedAtTheTavernGraybox"), DistTo(FMRV2FixtureContent().TavernSpawn) < 400.f, FString::Printf(TEXT("dist=%.0f"), DistTo(FMRV2FixtureContent().TavernSpawn)));
		Check(TEXT("Partial_StationSafeSpawnRecorded"), Machine->GetRecord().FindSafeSpawn(Machine->Content.StationLoc) != nullptr);
		WritesBefore = Machine->CheckpointWrites;
	});
	Add(0.3f, [this]()
	{
		// an OPTIONAL NPC, talked to through the real interactor, never changes onboarding progress
		AMRPlayerCharacter* P = Pawn(); const FVector Tav = Anchors[Machine->Content.TavernSpawn];
		P->SetActorLocation(Tav + FVector(600.f - 120.f, 800.f, 100.f), false, nullptr, ETeleportType::TeleportPhysics);
		Interactor->RefreshFocus();
		const bool bStarted = Interactor->Interact();
		Check(TEXT("Partial_OptionalNpcConversationStartsViaTheRealInteractor"), bStarted && Nar->GetRuntime()->IsActive(), Interactor->LastRefusal);
		int32 Guard = 0; while (Nar->GetRuntime()->IsActive() && Guard++ < 10) { if (Nar->GetRuntime()->GetView().bCanContinue) Nar->GetRuntime()->Continue(); else break; }
		Check(TEXT("Partial_OptionalDialogueCompletedInNarrativeSave"), Nar->GetState().CompletedDialogues.Contains(GraphBeta()));
		Check(TEXT("Partial_OnboardingUnchangedByTheOptionalNpc"), Machine->GetState() == EState::TavernApproach && Machine->CheckpointWrites == WritesBefore && !Machine->GetRecord().bTavianEncounterDone);
		P->SetActorLocation(Tav + FVector(-200.f, 0.f, 100.f), false, nullptr, ETeleportType::TeleportPhysics);
	});
	Add(0.3f, [this]()
	{
		Nar->ReachStandaloneObjective(Machine->Content.TavernObjective);   // the player reaches the tavern door
		Check(TEXT("Partial_EncounterStartedDialogueActive"), Machine->GetState() == EState::TavianEncounter && Nar->GetRuntime()->IsActive() && Machine->GetRecord().bTavianEncounterStarted && !Machine->GetRecord().bTavianEncounterDone, Machine->GetDebugString());
		Nar->GetRuntime()->Continue();
		Check(TEXT("Partial_OneTimeEffectAppliedOnce"), Nar->EffectsApplied == 1 && Nar->IsFactSet(FactMet()));
		Check(TEXT("Partial_StartedMarkerCheckpointed"), Machine->CheckpointFailures == 0 && Machine->GetRecord().Validate().Num() == 0);
		UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|INTERRUPT|quitting MID-DIALOGUE at %s"), *MROnboardingV2::StateId(Machine->GetState()).ToString());
	});
	Add(0.3f, [this]() { Finish(); });
}

void AMROnboardingV2TestDriver::BuildResume()
{
	Add(1.5f, [this]()
	{
		if (!Setup(true)) { StepIndex = Steps.Num(); return; }
		Check(TEXT("Resume_NarrativeLedgerSurvivedTheInterruption"), Nar->GetState().FiredEffects.Contains(FxMet()) && Nar->GetState().CompletedDialogues.Contains(GraphBeta()));
		Machine->Begin();
		const FMRV2LoadReport& L = Machine->GetLoadReport();
		Check(TEXT("Resume_LoadedNativeV2Checkpoint"), !L.bFallbackFresh && L.SourceVersion == 2 && L.ChosenGeneration >= 1, FString::Printf(TEXT("slot=%s gen=%d"), *L.ChosenSlot, L.ChosenGeneration));
		Check(TEXT("Resume_ResumedAtTheEncounterNotBefore"), Machine->GetState() == EState::TavianEncounter && Machine->GetResumeTarget() == EState::TavianEncounter, Machine->GetDebugString());
		Check(TEXT("Resume_InterruptedDialogueRecognisedAndRestarted"), Machine->WasDialogueInterrupted() && Nar->GetRuntime()->IsActive());
		Check(TEXT("Resume_NoReplayOfTheOneTimeEffect"), Nar->EffectsApplied == 0 && Nar->EffectsSuppressed == 1);
		Check(TEXT("Resume_PawnAtTheSavedTavernSafeSpawn"), DistTo(Machine->Content.TavernSpawn) < 400.f, FString::Printf(TEXT("dist=%.0f"), DistTo(Machine->Content.TavernSpawn)));
		Check(TEXT("Resume_AvatarNotReopened"), Cast<UMRDevAvatarFlowService>(Machine->AvatarService)->CreatorOpenCount == 0);
	});
	Add(0.4f, [this]()
	{
		// accept the fixture mission: continue, choose yes, continue
		UMRDialogueRuntime* Rt = Nar->GetRuntime(); int32 Guard = 0, Choices = 0;
		while (Rt->IsActive() && Guard++ < 20) { if (Rt->GetView().bCanContinue) Rt->Continue(); else if (Rt->GetView().Choices.Num() && Choices++ == 0) Rt->Choose(FName("c_yes")); else break; }
		Check(TEXT("Resume_MissionAcceptedNotCompleted"), Nar->GetMissionStatus(Mission()) == EMRQuestStatus::Active, FString::FromInt((int32)Nar->GetMissionStatus(Mission())));
		Check(TEXT("Resume_EncounterDoneDepartureApproach"), Machine->GetState() == EState::DepartureApproach && Machine->GetRecord().bTavianEncounterDone, Machine->GetDebugString());
		Check(TEXT("Resume_PawnAtTheDepartureGraybox"), DistTo(Machine->Content.DepartureSpawn) < 400.f, FString::Printf(TEXT("dist=%.0f"), DistTo(Machine->Content.DepartureSpawn)));
		Check(TEXT("Resume_DepartureGateConditionsMet"), Machine->EvaluateDeparture().bOpen, Machine->EvaluateDeparture().Summary());
	});
	Add(0.4f, [this]()
	{
		Nar->ReachStandaloneObjective(Machine->Content.DepartureObjective);   // the player reaches the departure terminal
		const FMRCheckpointV2& R = Machine->GetRecord();
		Check(TEXT("Resume_ScanIsTheExplicitOfflineSimulation"), R.PassportScanResult == EMRPassportScanResult::OfflineGuestSimulated && R.TravelAuthorization == EMRTravelAuthorization::Authorized && R.IdentityMode == EMRIdentityMode::OfflineGuest && R.OpaqueSubjectId.IsEmpty());
		Check(TEXT("Resume_TransitRecorded"), R.bTransitSeen || R.bTransitSkippedUnavailable);
		Check(TEXT("Resume_CoreArrivalAfterLoadAndSpawn"), R.bCoreArrived && R.FindSafeSpawn(Machine->Content.CoreLoc) != nullptr && DistTo(Machine->Content.CoreSpawn) < 400.f, FString::Printf(TEXT("dist=%.0f"), DistTo(Machine->Content.CoreSpawn)));
		Check(TEXT("Resume_CompletesToFreeExplore"), Machine->GetState() == EState::FreeExplore && R.bOnboardingCompleted && !R.bLegacyCompleted && R.SafeSpawns.Num() == 4, Machine->GetDebugString());
		Check(TEXT("Resume_MissionStillOnlyAccepted"), Nar->GetMissionStatus(Mission()) == EMRQuestStatus::Active);
		Check(TEXT("Resume_NoCheckpointFailures"), Machine->CheckpointFailures == 0);
		Check(TEXT("Resume_StuckPlayerRecoveryReturnsToTheCoreSpawn"), [&]() { Pawn()->SetActorLocation(Anchors[Machine->Content.StationSpawn] + FVector(0, 0, 100), false, nullptr, ETeleportType::TeleportPhysics); return Machine->RecoverToSafeSpawn() && DistTo(Machine->Content.CoreSpawn) < 400.f; }());
	});
	Add(0.3f, [this]() { Finish(); });
}

void AMROnboardingV2TestDriver::BuildReturning()
{
	Add(1.5f, [this]()
	{
		if (!Setup(true)) { StepIndex = Steps.Num(); return; }
		Machine->Begin();
		Check(TEXT("Returning_ImmediateFreeExplore"), Machine->GetState() == EState::FreeExplore && Machine->GetRecord().bOnboardingCompleted, Machine->GetDebugString());
		Check(TEXT("Returning_NothingReplayedOrWritten"), Machine->CheckpointWrites == 0 && Cast<UMRDevV2WorldService>(Machine->WorldService)->LoadLog.Num() == 0 && Cast<UMRDevPassportScanService>(Machine->ScanService)->ScanCount == 0);
		Check(TEXT("Returning_NoEncounterReplay"), Nar->EffectsApplied == 0 && !Nar->GetRuntime()->IsActive());
	});
	Add(0.3f, [this]() { Finish(); });
}
