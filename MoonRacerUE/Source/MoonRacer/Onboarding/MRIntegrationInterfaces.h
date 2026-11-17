// Moon Racer - onboarding integration interfaces (Phase 3B P3).
//
// These are the seams between the onboarding state machine and everything that depends on canon, content, or live
// services. Only canon-neutral DEVELOPMENT placeholders implement them (see MRDevOnboardingServices.h). None of these
// connects to Passport, Supabase or any website service. Content IDs are opaque FNames supplied by configuration.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "Onboarding/MROnboardingTypes.h"
#include "MRIntegrationInterfaces.generated.h"

UENUM()
enum class EMRPassportStatus : uint8
{
	OfflineGuest,   // the only status the v1 placeholder returns
	Linked,         // reserved (online, not implemented)
	NoPassport,     // reserved
	AuthRequired,   // reserved
	Unavailable,
	Error
};

UENUM()
enum class EMRServiceResult : uint8 { Ok, Unavailable, Failed, Cancelled /* interrupted by the player/system; the caller may retry (P5A) */ };

// ---- 1. Avatar Creator completion --------------------------------------------------------------------------------
UINTERFACE(MinimalAPI)
class UMRAvatarFlowService : public UInterface { GENERATED_BODY() };
class IMRAvatarFlowService
{
	GENERATED_BODY()
public:
	/** True if a valid confirmed avatar exists; fills the reference (AvatarId + Revision). */
	virtual bool HasValidConfirmedAvatar(FMRAvatarRef& OutRef) = 0;
	/** Ask the UI layer to open the Avatar Creator. Completion arrives as the avatar-saved event (see UMRAvatarSaveSubsystem::OnAvatarSaved). */
	virtual void OpenAvatarCreator() = 0;
};

// ---- 2. Passport status (no live Passport/Supabase in v1) ---------------------------------------------------------
UINTERFACE(MinimalAPI)
class UMRPassportService : public UInterface { GENERATED_BODY() };
class IMRPassportService
{
	GENERATED_BODY()
public:
	virtual void GetStatus(TFunction<void(EMRPassportStatus)> Done) = 0;
};

// ---- 3. Core world loading ---------------------------------------------------------------------------------------
UINTERFACE(MinimalAPI)
class UMRWorldService : public UInterface { GENERATED_BODY() };
class IMRWorldService
{
	GENERATED_BODY()
public:
	virtual bool IsLocationAvailable(FName LocationId) = 0;
	virtual void LoadLocation(FName LocationId, TFunction<void(EMRServiceResult)> Done) = 0;
};

// ---- 4. Player spawning ------------------------------------------------------------------------------------------
UINTERFACE(MinimalAPI)
class UMRSpawnService : public UInterface { GENERATED_BODY() };
class IMRSpawnService
{
	GENERATED_BODY()
public:
	/** Spawn/position the player (with the saved avatar applied). Reports the spawn point actually used. */
	virtual void SpawnPlayer(FName LocationId, FName SpawnPointId, TFunction<void(EMRServiceResult, FName UsedSpawnPointId)> Done) = 0;
	/** Stuck-player recovery: return the player to a previously recorded safe spawn. */
	virtual EMRServiceResult TeleportToSafeSpawn(const FMRSafeSpawn& Spawn) = 0;
};

// ---- 5. Arrival cinematic ----------------------------------------------------------------------------------------
UINTERFACE(MinimalAPI)
class UMRCinematicService : public UInterface { GENERATED_BODY() };
class IMRCinematicService
{
	GENERATED_BODY()
public:
	virtual bool IsCinematicAvailable(FName CinematicId) = 0;
	virtual void Play(FName CinematicId, bool bSkippable, TFunction<void(EMRArrivalOutcome)> Done) = 0;
};

// ---- 6. NPC interaction + objective trigger ---------------------------------------------------------------------
UINTERFACE(MinimalAPI)
class UMRInteractionService : public UInterface { GENERATED_BODY() };
class IMRInteractionService
{
	GENERATED_BODY()
public:
	/** Show/enable an objective and call Done when the player reaches it. */
	virtual void BeginObjective(FName ObjectiveId, TFunction<void(EMRServiceResult)> Done) = 0;
	virtual bool IsNpcAvailable(FName NpcId) = 0;
	virtual void Interact(FName NpcId, TFunction<void(EMRServiceResult)> Done) = 0;
};

// ---- 7. Dialogue -------------------------------------------------------------------------------------------------
UINTERFACE(MinimalAPI)
class UMRDialogueService : public UInterface { GENERATED_BODY() };
class IMRDialogueService
{
	GENERATED_BODY()
public:
	virtual bool IsDialogueAvailable(FName GraphId) = 0;
	/** Runs a deterministic authored graph to its end node. */
	virtual void RunDialogue(FName GraphId, TFunction<void(EMRServiceResult, FName EndNodeId)> Done) = 0;
	/** P5A additions (non-pure, default no-ops, so existing implementations keep working). An interrupted run reports EMRServiceResult::Cancelled. */
	virtual void CancelDialogue() {}
	virtual bool IsDialogueActive() const { return false; }
};

// ---- 8. First mission activation ---------------------------------------------------------------------------------
UINTERFACE(MinimalAPI)
class UMRQuestService : public UInterface { GENERATED_BODY() };
class IMRQuestService
{
	GENERATED_BODY()
public:
	virtual bool IsQuestAvailable(FName QuestId) = 0;
	/** Offer and accept (D-6: onboarding only needs the mission ACCEPTED). */
	virtual void OfferAndAccept(FName QuestId, TFunction<void(EMRServiceResult, EMRQuestStatus)> Done) = 0;
};
