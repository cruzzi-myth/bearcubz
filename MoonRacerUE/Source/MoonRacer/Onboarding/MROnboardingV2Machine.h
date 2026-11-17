// Moon Racer - DEVELOPMENT-ONLY v2 onboarding state machine (Phase 3B P5B-3B).
//
// The 12-state sequence START, ACCESS_CHECK, IDENTITY_CHECK, AVATAR_CHECK, STATION_ENTRY, TAVERN_APPROACH, TAVIAN_ENCOUNTER, DEPARTURE_APPROACH,
// PASSPORT_SCAN, TRANSIT_TO_CORE, CORE_ARRIVAL, FREE_EXPLORE, with explicit deterministic transitions. It does not reuse the v1 sequence, the v1
// subsystem or the v1 store; the v1 machine stays the default and is unchanged.
//
// ISOLATION: the machine refuses to begin unless the explicit launch flag -MROnbV2Dev is present, never in a Shipping build, and never on the default
// player slot. Nothing activates it for an existing profile. All content here is TEST FIXTURE - NONCANON; no canonical location, NPC, dialogue,
// mission or cinematic is defined. No Passport/Supabase/network access exists in this path.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Onboarding/MRCheckpointV2.h"
#include "Onboarding/MRCheckpointV2Store.h"
#include "Onboarding/MRIntegrationInterfaces.h"
#include "Onboarding/MRV2Services.h"
#include "MROnboardingV2Machine.generated.h"

class UMRNarrativeSubsystem;
class UMRAvatarSaveSubsystem;
struct FMRAvatarAppearance;

namespace MROnboardingV2Dev
{
	constexpr const TCHAR* FlagName = TEXT("MROnbV2Dev");
	/** The explicit launch flag -MROnbV2Dev is present (or a test override says so). */
	MOONRACER_API bool IsFlagPresent();
	/** True in a Shipping build (or when a test simulates it). */
	MOONRACER_API bool IsShippingBuild();
	/** The v2 development path may run: flag present AND not Shipping. */
	MOONRACER_API bool IsAllowed(FString* WhyNot = nullptr);
	/** "V2_DEV" only when allowed; otherwise "V1" (the default). */
	MOONRACER_API FName ActiveFlow();
	/** Test overrides (ignored in Shipping builds). Flag: -1 none, 0 force absent, 1 force present. */
	MOONRACER_API void SetFlagOverrideForTest(int32 Mode);
	MOONRACER_API void SetSimulateShippingForTest(bool bShipping);
}

enum class EMRV2Event : uint8
{
	SessionStarted, ReturningPlayer, AccessResolved, IdentityResolved, AvatarConfirmed, StationEntered, TavernReached,
	EncounterDone, DepartureReached, PassportScanned, TransitFinished, CoreArrived, Count
};

struct FMRV2EventPayload
{
	FMRAvatarRef AvatarRef;                                        // AvatarConfirmed
	FName UsedSpawnPointId;                                        // StationEntered / TavernReached / DepartureReached / CoreArrived
	EMRPassportScanResult Scan = EMRPassportScanResult::NotScanned;// PassportScanned
	EMRArrivalOutcome Cinematic = EMRArrivalOutcome::Played;       // TransitFinished
};

struct FMRV2TransitionResult
{
	bool bAccepted = false;
	EMROnboardingStateV2 From = EMROnboardingStateV2::Start, To = EMROnboardingStateV2::Start;
	FString Reason;
};

namespace MROnboardingV2Machine
{
	MOONRACER_API FName EventName(EMRV2Event E);
	/** The single event that completes (exits) a state. FreeExplore has none (Count). */
	MOONRACER_API EMRV2Event ExitEventFor(EMROnboardingStateV2 S);
	/** The state a state precedes in the spine. */
	MOONRACER_API EMROnboardingStateV2 Successor(EMROnboardingStateV2 S);
	/** The fixture location a state needs (None for the pre-world states). */
	MOONRACER_API FName LocationFor(EMROnboardingStateV2 S, const FMRV2FixtureContent& C);
}

DECLARE_MULTICAST_DELEGATE_TwoParams(FMROnV2StateChanged, EMROnboardingStateV2 /*From*/, EMROnboardingStateV2 /*To*/);
DECLARE_MULTICAST_DELEGATE_OneParam(FMROnV2Notice, const FString&);

UCLASS()
class MOONRACER_API UMROnboardingMachineV2 : public UObject
{
	GENERATED_BODY()
public:
	virtual void BeginDestroy() override;

	// ---- configuration: services are interfaces; only TEST FIXTURE placeholders exist ----
	UPROPERTY(Transient) TObjectPtr<UObject> AvatarService;       // IMRAvatarFlowService
	UPROPERTY(Transient) TObjectPtr<UObject> IdentityService;     // IMRPassportService (launch-time identity; NOT the scan)
	UPROPERTY(Transient) TObjectPtr<UObject> ScanService;         // IMRPassportScanService (the physical scan)
	UPROPERTY(Transient) TObjectPtr<UObject> WorldService;        // IMRWorldService
	UPROPERTY(Transient) TObjectPtr<UObject> SpawnService;        // IMRSpawnService
	UPROPERTY(Transient) TObjectPtr<UObject> CinematicService;    // IMRCinematicService
	UPROPERTY(Transient) TObjectPtr<UObject> InteractionService;  // IMRInteractionService
	UPROPERTY(Transient) TObjectPtr<UObject> DialogueService;     // IMRDialogueService
	FMRV2FixtureContent Content;
	FMRMigrationMap MigrationMap;               // empty until canon approves ids (no canon is hard-coded)
	FMRContentVersions ExpectedVersions;
	/** Everything other saves say. Null = unknown (migration treats it as "no evidence"; the departure gate cannot evaluate narrative conditions). */
	TFunction<FMRSaveEvidence()> EvidenceProvider;
	/** Optional narrative conversation starter for NPC interactions that are NOT part of the onboarding flow. */
	TFunction<bool(FName, FString*)> OptionalConversationStarter;
	/** TEST HOOK: do not run service-driven state entry; events are supplied by the caller. */
	bool bManualDrive = false;

	/** Install the TEST FIXTURE - NONCANON services (identity, avatar, scan, world, spawn, cinematic, interaction, dialogue). */
	void UseDevServices(UWorld* WorldContext = nullptr);
	/** Receive the avatar-saved event of the avatar subsystem. */
	void BindAvatarSaveEvents(UMRAvatarSaveSubsystem* AvatarSave);

	// ---- lifecycle ----
	/** Gate, load (read-only), reconcile, resume and start. Returns false (with the reason) when the development path is refused. */
	bool Begin(FString* WhyRefused = nullptr);
	bool HasBegun() const { return bBegun; }
	FMRV2TransitionResult HandleEvent(EMRV2Event Event, const FMRV2EventPayload& Payload = FMRV2EventPayload());

	EMROnboardingStateV2 GetState() const { return State; }
	const FMRCheckpointV2& GetRecord() const { return Record; }
	const FMRV2LoadReport& GetLoadReport() const { return LoadReport; }
	const FMRConsistencyReport& GetConsistency() const { return Consistency; }
	bool IsBlocked() const { return !BlockReason.IsEmpty(); }
	const FString& GetBlockReason() const { return BlockReason; }
	bool IsBlockRetryable() const { return bBlockRetryable; }
	/** The first state that was still incomplete when this launch began (where the player resumes after the access/identity/avatar re-checks). */
	EMROnboardingStateV2 GetResumeTarget() const { return ContinueTarget; }
	bool WasDialogueInterrupted() const { return bInterruptedDialogue; }

	void Retry();
	/** IDENTITY_CHECK only: continue as an offline guest after a non-offline/unavailable status (v2 dev has no online identity). */
	bool ContinueOffline();
	/** Stuck-player recovery: return to the safe spawn recorded for the current state's location. */
	bool RecoverToSafeSpawn();
	void NotifyAvatarSaved(const FMRAvatarAppearance& Appearance);
	/** A conversation with an NPC that is not part of the flow (never changes onboarding state, never checkpoints). */
	bool InteractOptional(FName NpcId, FString* WhyNot = nullptr);
	/** Re-run the cross-save reconciliation (read-only). */
	const FMRConsistencyReport& Reconcile();
	/** Evaluate the departure gate against the current evidence. */
	FMRDepartureResult EvaluateDeparture() const;
	FString GetDebugString() const;

	FMROnV2StateChanged OnStateChanged;
	FMROnV2Notice OnNotice;

	// ---- observable history (tests/dev) ----
	TArray<FString> TransitionLog, CheckpointLog;
	int32 CheckpointWrites = 0, CheckpointFailures = 0, RejectedEvents = 0;
	TArray<FString> BackupsCreated;                 // across all checkpoint writes of this session
	bool bContentVersionMismatch = false;

private:
	void EnterState(EMROnboardingStateV2 S);
	void Block(const FString& Reason, bool bRetryable);
	void Notice(const FString& Text);
	bool Checkpoint();
	void Finish(int32 Token, EMRV2Event E, const FMRV2EventPayload& P);
	void EnsureLocation(int32 Token, FName Loc, TFunction<void()> Then);
	void RunLocated(int32 Token, EMROnboardingStateV2 S);
	FMRSaveEvidence Evidence() const;
	EMROnboardingStateV2 TargetAfter(EMROnboardingStateV2 From, const FMRCheckpointV2& Next) const;
	static void UpsertSpawn(FMRCheckpointV2& R, FName Loc, FName Spawn);

	IMRAvatarFlowService* Avatar() const { return Cast<IMRAvatarFlowService>(AvatarService); }
	IMRPassportService* Identity() const { return Cast<IMRPassportService>(IdentityService); }
	IMRPassportScanService* Scan() const { return Cast<IMRPassportScanService>(ScanService); }
	IMRWorldService* World() const { return Cast<IMRWorldService>(WorldService); }
	IMRSpawnService* Spawn() const { return Cast<IMRSpawnService>(SpawnService); }
	IMRCinematicService* Cinematic() const { return Cast<IMRCinematicService>(CinematicService); }
	IMRInteractionService* Interaction() const { return Cast<IMRInteractionService>(InteractionService); }
	IMRDialogueService* Dialogue() const { return Cast<IMRDialogueService>(DialogueService); }

	FMRCheckpointV2 Record;
	FMRV2LoadReport LoadReport;
	FMRConsistencyReport Consistency;
	EMROnboardingStateV2 State = EMROnboardingStateV2::Start;
	EMROnboardingStateV2 ContinueTarget = EMROnboardingStateV2::AvatarCheck;
	bool bBegun = false, bInterruptedDialogue = false;
	FString BlockReason; bool bBlockRetryable = false;
	int32 EnterToken = 0;
	FName CurrentLocation;                          // set ONLY after the location loaded AND a spawn was confirmed
	TMap<FName, FName> ConfirmedSpawn;              // location -> the spawn confirmed this session
	FDelegateHandle AvatarSavedHandle;
	TWeakObjectPtr<UMRAvatarSaveSubsystem> BoundAvatarSave;
};

namespace MRNarrative
{
	/** Point the v2 machine's dialogue and interaction seams at the narrative registry, adopt its content versions, and feed live narrative evidence
	 *  (the departure gate and the migration evidence read the REAL narrative state). Does not change the narrative systems. */
	MOONRACER_API void BindOnboardingV2(UMROnboardingMachineV2* Machine, UMRNarrativeSubsystem* Narrative, UMRAvatarSaveSubsystem* AvatarSave = nullptr);
}
