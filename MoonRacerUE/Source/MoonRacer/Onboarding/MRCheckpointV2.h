// Moon Racer - onboarding CHECKPOINT V2 schema + pure migration/reconciliation (Phase 3B P5B-3A). INFRASTRUCTURE ONLY.
//
// The proposed 12-state sequence is NOT ACTIVE: no state machine consumes these types. The 11-state v1 machine, its record
// (FMRProgressRecord) and its store are the live default and are unchanged. This file defines:
//   * the v2 record (FMRCheckpointV2) with SEPARATE launch-identity and physical Passport-scan fields,
//   * the (inactive) v2 state names and a pure "first incomplete state" function,
//   * a deterministic, in-memory v1 -> v2 migration that never claims anything unverified,
//   * a read-only cross-save reconciliation (avatar save / onboarding / narrative save / one-time ledger).
// Canonical ids (locations, dialogue ids, effect ids) are NEVER hard-coded: they arrive through FMRMigrationMap, empty until canon exists.

#pragma once

#include "CoreMinimal.h"
#include "Onboarding/MROnboardingTypes.h"
#include "Onboarding/MRProgressSaveGame.h"
#include "Narrative/MRNarrativeSaveGame.h"
#include "MRCheckpointV2.generated.h"

namespace MROnboardingV2 { constexpr int32 CheckpointVersion = 2; }

/** The PROPOSED v2 spine. Data only: nothing drives these states yet. */
UENUM(BlueprintType)
enum class EMROnboardingStateV2 : uint8
{
	Start, AccessCheck, IdentityCheck, AvatarCheck, StationEntry, TavernApproach, TavianEncounter,
	DepartureApproach, PassportScan, TransitToCore, CoreArrival, FreeExplore,
	Count UMETA(Hidden)
};

/** Result of the PHYSICAL in-world scan at the departure terminal. Distinct from launch identity; never an authentication. */
UENUM(BlueprintType)
enum class EMRPassportScanResult : uint8 { NotScanned, OfflineGuestSimulated, LinkedVerified, LegacyGrandfathered };

UENUM(BlueprintType)
enum class EMRTravelAuthorization : uint8 { NotAuthorized, Authorized, LegacyGrandfathered };

UENUM(BlueprintType)
enum class EMRLegacyOrigin : uint8 { None, V1Mapped, V1Completed, V1Fallback };

USTRUCT(BlueprintType)
struct MOONRACER_API FMRLocationSafeSpawn
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName LocationId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName SpawnPointId;
};

/** The v1 data a migrated record came from, kept verbatim for audit. Never consulted for gameplay. */
USTRUCT(BlueprintType)
struct MOONRACER_API FMRLegacyV1Snapshot
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bPresent = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName State;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRProgressFlags Flags;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRSafeSpawn LastSafeSpawn;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRAvatarRef AvatarRef;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRContentVersions Content;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FGuid LocalProfileId;
};

USTRUCT(BlueprintType)
struct MOONRACER_API FMRCheckpointV2
{
	GENERATED_BODY()

	// ---- launch identity (headless, every launch) - NOT the physical scan ----
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FGuid LocalProfileId;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) EMRIdentityMode IdentityMode = EMRIdentityMode::OfflineGuest;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FString OpaqueSubjectId;   // always empty in v1/v2-offline
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bAccessResolved = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bIdentityResolved = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bAvatarConfirmed = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRAvatarRef AvatarRef;

	// ---- station / tavern ----
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bStationEntered = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bTavernReached = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bTavianEncounterStarted = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bTavianEncounterDone = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bDepartureReached = false;

	// ---- the PHYSICAL in-world Passport scan and the resulting departure authorization ----
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) EMRPassportScanResult PassportScanResult = EMRPassportScanResult::NotScanned;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) EMRTravelAuthorization TravelAuthorization = EMRTravelAuthorization::NotAuthorized;

	// ---- transit and arrival ----
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bTransitSeen = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bTransitSkippedUnavailable = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bCoreArrived = false;

	// ---- per-location safe spawns (replaces the single v1 LastSafeSpawn) ----
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) TArray<FMRLocationSafeSpawn> SafeSpawns;

	// ---- completion and legacy ----
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bOnboardingCompleted = false;
	/** Explicit: this player completed onboarding under the LEGACY (v1) order. Distinct from a recorded scan/arrival. */
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) bool bLegacyCompleted = false;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) EMRLegacyOrigin LegacyOrigin = EMRLegacyOrigin::None;
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRLegacyV1Snapshot LegacyV1;

	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FName CurrentState = FName("START");
	UPROPERTY(BlueprintReadWrite, EditAnywhere, Category="MR|Onboarding", SaveGame) FMRContentVersions Content;

	static FMRCheckpointV2 MakeNew();
	bool IsStateDone(EMROnboardingStateV2 S) const;
	const FMRLocationSafeSpawn* FindSafeSpawn(FName LocationId) const;
	/** Human-readable problems; empty = consistent. */
	TArray<FString> Validate() const;
	FString ToCanonicalString() const;
	bool operator==(const FMRCheckpointV2& O) const { return ToCanonicalString() == O.ToCanonicalString(); }
};

/** On-disk object. Derives from the v1 save so a v1 reader sees SaveVersion 2 as a NEWER version: it never loads it as v1 and never overwrites it. */
UCLASS()
class MOONRACER_API UMRProgressSaveGameV2 : public UMRProgressSaveGame
{
	GENERATED_BODY()
public:
	UMRProgressSaveGameV2() { SaveVersion = MROnboardingV2::CheckpointVersion; Notice = TEXT("Local development onboarding checkpoint v2. Not a Passport record."); }
	UPROPERTY(SaveGame) int32 Checksum2 = 0;
	UPROPERTY(SaveGame) FMRCheckpointV2 RecordV2;
};

// ---------------------------------------------------------------------------------------------------------------
/** What other saves say. Everything here is evidence, read-only; empty/unchecked means "unknown", never "false". */
struct FMRAvatarEvidence
{
	bool bChecked = false;            // the avatar save was actually inspected
	bool bValid = false;              // a valid confirmed avatar exists
	FGuid AvatarId; int32 Revision = 0;
	bool bMalformedPreserved = false; // a file exists but was rejected and is preserved untouched
	bool bNewerRejected = false;
};

struct FMRNarrativeEvidence
{
	bool bAvailable = false;          // the narrative save was loaded and verified
	TSet<FName> CompletedDialogues, FiredEffects, CompletedObjectives, Facts;
	TMap<FName, EMRQuestStatus> Missions;
	static FMRNarrativeEvidence From(const FMRNarrativeState& S);
};

/** APPROVED canonical ids the migration/reconciliation may rely on. ALL EMPTY today: no canon is hard-coded, so evidence-dependent mappings stay conservative. */
struct FMRMigrationMap
{
	FName ApprovedCoreLocationId;           // a v1 Core safe spawn is carried only if its MapId equals this
	TArray<FName> TavianDialogueIds;        // completing any of these is the evidence that the Tavian conversation happened
	TArray<FName> TavianEncounterEffectIds; // one-time effects that conversation applies
};

struct FMRMigrationContext
{
	FMRNarrativeEvidence Narrative;
	FMRAvatarEvidence Avatar;
	FMRMigrationMap Map;
};

enum class EMRMigrationCase : uint8
{
	A_BeforeAvatar, B_AvatarOnly, C_CoreSpawned, D1_TavianEvidence, D2_TavianNoEvidence, E_CompletedGrandfathered, F_Fallback
};

struct FMRMigrationResult
{
	bool bOk = false;
	EMRMigrationCase Case = EMRMigrationCase::F_Fallback;
	FMRCheckpointV2 Record;
	TArray<FString> Notes;
	FString Rejected;                 // set when the input cannot be migrated at all (e.g. unsupported newer version)
};

enum class EMRConsistencySeverity : uint8 { Info, Warning, Conflict };

struct FMRInconsistency
{
	FName Code; EMRConsistencySeverity Severity = EMRConsistencySeverity::Info; FString Message; TArray<FString> Evidence;
};

struct FMRConsistencyReport
{
	TArray<FMRInconsistency> Items;
	bool Has(const TCHAR* Code) const { for (const FMRInconsistency& I : Items) if (I.Code == FName(Code)) return true; return false; }
	bool HasConflict() const { for (const FMRInconsistency& I : Items) if (I.Severity == EMRConsistencySeverity::Conflict) return true; return false; }
	FString ToString() const;
};

struct FMRSaveEvidence { FMRAvatarEvidence Avatar; FMRNarrativeEvidence Narrative; FMRMigrationMap Map; };

namespace MROnboardingV2
{
	MOONRACER_API FName StateId(EMROnboardingStateV2 S);
	MOONRACER_API bool ParseState(FName Id, EMROnboardingStateV2& Out);
	MOONRACER_API const TArray<EMROnboardingStateV2>& Spine();
	/** Pure: the first v2 state that is not done (FreeExplore when completed). Where a v2 machine WOULD resume; no machine uses it yet. */
	MOONRACER_API EMROnboardingStateV2 FirstIncompleteState(const FMRCheckpointV2& R);

	/** Deterministic, in-memory v1 -> v2. Never writes, never mutates the input, never claims an unverified station/scan/transit/arrival. */
	MOONRACER_API FMRMigrationResult MigrateV1ToV2(const FMRProgressRecord& V1, const FMRMigrationContext& Ctx);
	/** Version-aware wrapper: <=1 migrates (v0 via the existing chain), 2 passes through unchanged (idempotent), >2 is REJECTED safely. */
	MOONRACER_API FMRMigrationResult MigrateSaveObject(UMRProgressSaveGame* Save, const FMRMigrationContext& Ctx);

	/** Read-only reconciliation: reports disagreements with their evidence; changes nothing and invents nothing. */
	MOONRACER_API FMRConsistencyReport ReconcileSaves(const FMRCheckpointV2& Onboarding, const FMRSaveEvidence& Evidence);

	MOONRACER_API int32 ComputeChecksum(int32 Generation, const FMRCheckpointV2& R);
}
