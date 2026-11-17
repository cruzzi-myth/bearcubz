// Moon Racer - onboarding foundation types (Phase 3B, P0-P4). CANON-INDEPENDENT.
//
// The 11-state spine and flag names come from the approved architecture. No canonical content (Core geography, NPCs,
// dialogue, missions, cinematics) is defined here. Content IDs used by development placeholders are explicitly
// "TEST_FIXTURE_NONCANON_*". Progress is LOCAL only and is never a Passport record.

#pragma once

#include "CoreMinimal.h"
#include "Avatar/MRAvatarTypes.h"
#include "MROnboardingTypes.generated.h"

UENUM(BlueprintType)
enum class EMROnboardingState : uint8
{
	Start,
	AccessCheck,
	PassportCheck,
	AvatarCheck,
	ArrivalCinematic,
	CoreSpawn,
	FirstObjective,
	TavianDialogue,
	BartenderHandoff,
	FirstMission,
	FreeExplore,
	Count UMETA(Hidden)
};

UENUM(BlueprintType)
enum class EMROnboardingEvent : uint8
{
	SessionStarted,       // START -> ACCESS_CHECK (new or resuming)
	ReturningPlayer,      // START -> FREE_EXPLORE (onboarding already completed)
	AccessResolved,
	PassportChecked,
	AvatarConfirmed,
	ArrivalFinished,
	CoreReady,
	ObjectiveReached,
	FirstContactDone,     // TAVIAN_DIALOGUE exit
	HandoffDone,          // BARTENDER_HANDOFF exit
	MissionAccepted       // FIRST_MISSION exit (D-6: accepted, not completed)
};

UENUM(BlueprintType)
enum class EMRIdentityMode : uint8
{
	OfflineGuest,   // v1: no account claims of any kind
	OnlineLinked    // reserved; not implemented (D-1/D-3)
};

UENUM(BlueprintType)
enum class EMRQuestStatus : uint8 { NotOffered, Offered, Active, Completed };

UENUM(BlueprintType)
enum class EMRArrivalOutcome : uint8
{
	Played,
	SkippedByPlayer,
	SkippedAlreadySeen,
	SkippedUnavailable   // content missing/failed: moves on, but is NOT recorded as "seen"
};

namespace MROnboarding
{
	constexpr int32 CurrentProgressVersion = 1;

	MOONRACER_API FName StateId(EMROnboardingState State);
	MOONRACER_API bool ParseState(FName Id, EMROnboardingState& Out);
	MOONRACER_API EMROnboardingState Successor(EMROnboardingState State);
	/** The one event that completes (exits) a state. */
	MOONRACER_API EMROnboardingEvent ExitEventFor(EMROnboardingState State);
	MOONRACER_API const TArray<EMROnboardingState>& Spine();
	MOONRACER_API FName EventName(EMROnboardingEvent Event);
}

/** Where the player may safely be returned. IDs only (resolved by the world service), never raw coordinates. */
USTRUCT(BlueprintType)
struct MOONRACER_API FMRSafeSpawn
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName MapId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName SpawnPointId;
	bool IsSet() const { return !MapId.IsNone() && !SpawnPointId.IsNone(); }
	bool operator==(const FMRSafeSpawn& O) const { return MapId == O.MapId && SpawnPointId == O.SpawnPointId; }
};

/** Reference to the confirmed avatar. Appearance data lives ONLY in the avatar save. */
USTRUCT(BlueprintType)
struct MOONRACER_API FMRAvatarRef
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FGuid AvatarId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) int32 Revision = 0;
	bool IsSet() const { return AvatarId.IsValid(); }
	bool operator==(const FMRAvatarRef& O) const { return AvatarId == O.AvatarId && Revision == O.Revision; }
};

/** Versions of canonical content the checkpoint was written against. "unresolved" until canon is approved. */
USTRUCT(BlueprintType)
struct MOONRACER_API FMRContentVersions
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName CoreManifestVersion = FName("unresolved");
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName QuestRegistryVersion = FName("unresolved");
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName DialogueVersion = FName("unresolved");
	bool operator==(const FMRContentVersions& O) const { return CoreManifestVersion == O.CoreManifestVersion && QuestRegistryVersion == O.QuestRegistryVersion && DialogueVersion == O.DialogueVersion; }
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRProgressFlags
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bAccessResolved = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bPassportChecked = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bAvatarConfirmed = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bArrivalSeen = false;
	/** Arrival content was unavailable: the state was passed without being recorded as seen. Counts as "done" for ordering only. */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bArrivalSkippedUnavailable = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bCoreSpawned = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bFirstObjectiveDone = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bTavianIntroduced = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bBartenderHandoff = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) EMRQuestStatus FirstQuestStatus = EMRQuestStatus::NotOffered;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bOnboardingCompleted = false;

	bool operator==(const FMRProgressFlags& O) const;
};

/** Everything persisted about onboarding progress (the SaveGame wraps this with version/generation/checksum). */
USTRUCT(BlueprintType)
struct MOONRACER_API FMRProgressRecord
{
	GENERATED_BODY()

	/** Local-only profile id. NOT a Passport id. */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FGuid LocalProfileId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) EMRIdentityMode IdentityMode = EMRIdentityMode::OfflineGuest;
	/** Reserved for an approved server contract. Always EMPTY in v1. Never a credential. */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FString OpaqueSubjectId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName CurrentState = FName("START");
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRProgressFlags Flags;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRSafeSpawn LastSafeSpawn;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRAvatarRef AvatarRef;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRContentVersions Content;

	static FMRProgressRecord MakeNew();
	/** True if the state's completion marker is set. START is always "done". */
	bool IsStateDone(EMROnboardingState State) const;
	/** Returns human-readable problems; empty = consistent. Checks ordering, required fields and completion rules. */
	TArray<FString> Validate() const;
	/** Deterministic text form used for the integrity checksum. */
	FString ToCanonicalString() const;
	bool operator==(const FMRProgressRecord& O) const;
};

/** Facts about the world outside the save that the resume router must re-verify. */
struct FMRResumeContext
{
	bool bAvatarValid = true;          // a valid confirmed avatar still exists in the avatar save
	FGuid CurrentAvatarId;             // avatar save's current AvatarId (for reference restoration)
};

struct FMRResumePlan
{
	EMROnboardingState Target = EMROnboardingState::AvatarCheck;  // first state that must still be completed (where play resumes)
	bool bAvatarRevisit = false;       // avatar flag was set but no valid avatar exists: pass through AVATAR_CHECK again, then continue to Target
	bool bReturningPlayer = false;
	bool bNeedsRespawnFirst = false;   // Target is after CORE_SPAWN: the level must be loaded/spawned first
	FMRProgressFlags AdjustedFlags;    // flags after re-validation (e.g. avatar no longer valid)
	TArray<FString> Notes;
};

namespace MROnboarding
{
	/** Pure, deterministic resume routing. */
	MOONRACER_API FMRResumePlan ComputeResumePlan(const FMRProgressRecord& Record, const FMRResumeContext& Context);
}
