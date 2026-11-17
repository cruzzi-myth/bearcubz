// Moon Racer - onboarding state machine (Phase 3B P1). Canon-independent, local-only, offline-first (D-1).
//
// Deterministic: a state completes only on its single expected exit event; anything else is rejected without changing
// state. A state change is checkpointed (A/B slots) on every completion edge. Services are interfaces; only
// "TEST FIXTURE - NONCANON" placeholders exist. Blocked states never advance or checkpoint.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Onboarding/MROnboardingTypes.h"
#include "Onboarding/MRIntegrationInterfaces.h"
#include "Onboarding/MRDevOnboardingServices.h"
#include "Onboarding/MRProgressSaveGame.h"
#include "MROnboardingSubsystem.generated.h"

struct FMREventPayload
{
	FMRAvatarRef AvatarRef;                                   // AvatarConfirmed
	EMRArrivalOutcome Arrival = EMRArrivalOutcome::Played;    // ArrivalFinished
	FName UsedSpawnPointId;                                   // CoreReady
};

struct FMRTransitionResult
{
	bool bAccepted = false;
	EMROnboardingState From = EMROnboardingState::Start;
	EMROnboardingState To = EMROnboardingState::Start;
	FString Reason;   // why it was rejected
};

DECLARE_MULTICAST_DELEGATE_TwoParams(FMROnStateChanged, EMROnboardingState /*From*/, EMROnboardingState /*To*/);
DECLARE_MULTICAST_DELEGATE_OneParam(FMROnOnboardingNotice, const FString&);

UCLASS()
class MOONRACER_API UMROnboardingSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// ---- configuration (services are interfaces; placeholders are fixtures) ----
	UPROPERTY(Transient) TObjectPtr<UObject> AvatarService;
	UPROPERTY(Transient) TObjectPtr<UObject> PassportService;
	UPROPERTY(Transient) TObjectPtr<UObject> WorldService;
	UPROPERTY(Transient) TObjectPtr<UObject> SpawnService;
	UPROPERTY(Transient) TObjectPtr<UObject> CinematicService;
	UPROPERTY(Transient) TObjectPtr<UObject> InteractionService;
	UPROPERTY(Transient) TObjectPtr<UObject> DialogueService;
	UPROPERTY(Transient) TObjectPtr<UObject> QuestService;
	FMRFlowContent Content;
	/** Content versions this build/bundle represents (P5A). Stamped into every checkpoint and compared on resume. Defaults to "unresolved" (= fixtures/legacy). */
	FMRContentVersions ExpectedVersions;
	/** Take content IDs from DA_MR_OnboardingFlow when it exists (fixtures today; the approved registry later). */
	bool bLoadContentFromAsset = true;

	/** Install the TEST FIXTURE - NONCANON placeholders for every interface. */
	void UseDevServices(UWorld* WorldContext = nullptr);

	// ---- lifecycle ----
	/** Load the latest valid checkpoint, route (resume/returning/new) and begin. Idempotent per session. */
	void Begin();
	bool HasBegun() const { return bBegun; }

	/** The only way a state completes. Rejected events change nothing. */
	FMRTransitionResult HandleEvent(EMROnboardingEvent Event, const FMREventPayload& Payload = FMREventPayload());

	EMROnboardingState GetState() const { return State; }
	const FMRProgressRecord& GetRecord() const { return Record; }
	const FMRProgressLoadReport& GetLoadReport() const { return LoadReport; }
	bool IsBlocked() const { return !BlockReason.IsEmpty(); }
	const FString& GetBlockReason() const { return BlockReason; }
	bool IsBlockRetryable() const { return bBlockRetryable; }

	/** Re-run the current (blocked) state, e.g. after missing content becomes available. */
	void Retry();
	/** PASSPORT_CHECK only: explicitly continue as an offline guest after a non-offline/failed status (v1 has no online identity). */
	bool ContinueOffline();
	/** Stuck-player recovery: return to the last recorded safe spawn. (UI for this is out of scope for P0-P4.) */
	bool RecoverToSafeSpawn();
	/** Development: wipe this base slot's checkpoints and restart. */
	void ResetProgressForDev();
	/** Avatar Creator completion (bound to UMRAvatarSaveSubsystem::OnAvatarSaved). Public so tests can drive it. */
	void NotifyAvatarSaved(const FMRAvatarAppearance& Appearance);

	FString GetDebugString() const;

	FMROnStateChanged OnStateChanged;
	FMROnOnboardingNotice OnNotice;

	// ---- observable history (tests/dev) ----
	TArray<FString> TransitionLog;
	TArray<FString> CheckpointLog;
	int32 CheckpointWrites = 0, CheckpointFailures = 0, RejectedEvents = 0;
	FMRResumePlan LastResumePlan;
	/** P5A: true when the loaded checkpoint was written against different content versions (progress is KEPT; the stale safe spawn is not trusted). */
	bool bContentVersionMismatch = false;
	TArray<FString> ContentVersionNotes;

private:
	void EnterState(EMROnboardingState S);
	void Block(const FString& Reason, bool bRetryable);
	void Notice(const FString& Text);
	bool Checkpoint();
	void CompleteFromService(int32 Token, EMROnboardingEvent Event, const FMREventPayload& Payload);
	EMROnboardingState ComputeNext(EMROnboardingState Cur) const;

	IMRAvatarFlowService* Avatar() const { return Cast<IMRAvatarFlowService>(AvatarService); }
	IMRPassportService* Passport() const { return Cast<IMRPassportService>(PassportService); }
	IMRWorldService* World() const { return Cast<IMRWorldService>(WorldService); }
	IMRSpawnService* Spawn() const { return Cast<IMRSpawnService>(SpawnService); }
	IMRCinematicService* Cinematic() const { return Cast<IMRCinematicService>(CinematicService); }
	IMRInteractionService* Interaction() const { return Cast<IMRInteractionService>(InteractionService); }
	IMRDialogueService* Dialogue() const { return Cast<IMRDialogueService>(DialogueService); }
	IMRQuestService* Quest() const { return Cast<IMRQuestService>(QuestService); }

	FMRProgressRecord Record;
	FMRProgressLoadReport LoadReport;
	EMROnboardingState State = EMROnboardingState::Start;
	EMROnboardingState ContinueTarget = EMROnboardingState::AvatarCheck;
	bool bAvatarRevisit = false;
	bool bBegun = false;
	FString BlockReason;
	bool bBlockRetryable = false;
	int32 EnterToken = 0;     // invalidates callbacks from a state that was left/re-entered
	bool bRetryingSpawnWithDefault = false;
	FDelegateHandle AvatarSavedHandle;
};
