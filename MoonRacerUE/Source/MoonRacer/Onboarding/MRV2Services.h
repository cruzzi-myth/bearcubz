// Moon Racer - services for the DEVELOPMENT-ONLY v2 onboarding machine (Phase 3B P5B-3B). ADDITIVE: nothing here is used by the live v1 machine.
//
// EVERYTHING that produces content here is "TEST FIXTURE - NONCANON". Nothing calls Passport, Supabase or any network service; nothing issues a token.
//   * IMRPassportScanService : the PHYSICAL in-world Passport scan at the departure terminal. Separate from launch-time identity (IMRPassportService).
//     The only implementation is a dev fixture whose result is EMRPassportScanResult::OfflineGuestSimulated - an explicit simulation, never an authentication.
//   * MRDeparture            : a configurable, pure departure-condition evaluator over narrative EVIDENCE. Missing/unresolved conditions BLOCK.
//   * UMRDevV2*Service       : fixture world / spawn / cinematic / scan services with failure and "hold" (interruption) switches for the tests.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "Onboarding/MRCheckpointV2.h"
#include "Onboarding/MRIntegrationInterfaces.h"
#include "MRV2Services.generated.h"

class UWorld;

// ---- Passport scan service (additive interface) --------------------------------------------------------------------------------
enum class EMRScanOutcome : uint8 { Scanned, Refused, Unavailable, Cancelled };

struct FMRScanResponse
{
	EMRScanOutcome Outcome = EMRScanOutcome::Unavailable;
	EMRPassportScanResult Result = EMRPassportScanResult::NotScanned;   // meaningful when Scanned
	FString Why;
};

UINTERFACE(MinimalAPI)
class UMRPassportScanService : public UInterface { GENERATED_BODY() };
class IMRPassportScanService
{
	GENERATED_BODY()
public:
	/** Perform the physical scan. Completion may be asynchronous. An interrupted scan reports Cancelled and records nothing. */
	virtual void Scan(TFunction<void(const FMRScanResponse&)> Done) = 0;
	virtual void CancelScan() {}
};

// ---- Departure gate ---------------------------------------------------------------------------------------------------------------
enum class EMRDepartureConditionType : uint8
{
	FactSet,             // Subject = fact id
	DialogueCompleted,   // Subject = dialogue graph id
	ObjectiveCompleted,  // Subject = objective id
	MissionAccepted,     // Subject = mission id; true for Active OR Completed (acceptance can never be undone)
	MissionCompleted     // Subject = mission id; true ONLY for Completed - acceptance alone never satisfies it
};

struct FMRDepartureCondition
{
	EMRDepartureConditionType Type = EMRDepartureConditionType::FactSet;
	FName Subject;
	FString Describe() const;
};

/** Configuration of the departure gate. SYNTHETIC conditions only: the canonical artifact mission is NOT hard-coded as a travel requirement. */
struct FMRDepartureConfig
{
	/** False = the conditions have not been configured/approved: departure is BLOCKED. */
	bool bResolved = false;
	/** An explicit statement that there are no requirements. Without it an empty condition list is treated as unresolved. */
	bool bNoRequirementsByDesign = false;
	TArray<FMRDepartureCondition> Conditions;
};

struct FMRDepartureResult
{
	bool bOpen = false;
	bool bUnresolved = false;       // blocked because the configuration or the evidence is missing (not because a condition is unmet)
	TArray<FString> Unmet;
	FString Summary() const;
};

namespace MRDeparture
{
	/** Pure. Closed unless the configuration is resolved and every condition holds in the supplied evidence. */
	MOONRACER_API FMRDepartureResult Evaluate(const FMRDepartureConfig& Config, const FMRNarrativeEvidence& Evidence);
}

// ---- Fixture content ids (TEST_FIXTURE_NONCANON; never canonical ids) ------------------------------------------------------------
struct FMRV2FixtureContent
{
	// logical test locations - NOT canonical geography and NOT permanent ids
	FName StationLoc = FName("TEST_FIXTURE_NONCANON_V2_STATION");
	FName TavernLoc = FName("TEST_FIXTURE_NONCANON_V2_TAVERN_APPROACH");
	FName DepartureLoc = FName("TEST_FIXTURE_NONCANON_V2_DEPARTURE_TERMINAL");
	FName CoreLoc = FName("TEST_FIXTURE_NONCANON_V2_CORE_ARRIVAL");
	FName StationSpawn = FName("TEST_FIXTURE_NONCANON_V2_SPAWN_STATION");
	FName TavernSpawn = FName("TEST_FIXTURE_NONCANON_V2_SPAWN_TAVERN");
	FName DepartureSpawn = FName("TEST_FIXTURE_NONCANON_V2_SPAWN_DEPARTURE");
	FName CoreSpawn = FName("TEST_FIXTURE_NONCANON_V2_SPAWN_CORE");
	FName TavernObjective = FName("TEST_FIXTURE_NONCANON_V2_OBJECTIVE_TAVERN");
	FName DepartureObjective = FName("TEST_FIXTURE_NONCANON_V2_OBJECTIVE_DEPARTURE");
	FName EncounterNpc = FName("TEST_FIXTURE_NPC_ALPHA");              // the fixture stand-in for the tavern encounter (matches MRNarrativeFixtures)
	FName EncounterDialogue = FName("TEST_FIXTURE_DIALOGUE_ALPHA");
	FName OptionalNpc = FName("TEST_FIXTURE_NPC_BETA");
	FName TransitCinematic = FName("TEST_FIXTURE_NONCANON_V2_TRANSIT");
	FMRDepartureConfig Departure;                                       // unresolved by default: departure BLOCKS until a test/config supplies conditions

	FName DefaultSpawnFor(FName Loc) const
	{
		return Loc == StationLoc ? StationSpawn : Loc == TavernLoc ? TavernSpawn : Loc == DepartureLoc ? DepartureSpawn : Loc == CoreLoc ? CoreSpawn : NAME_None;
	}
};

// ---- Dev fixtures -----------------------------------------------------------------------------------------------------------------
/** TEST FIXTURE - NONCANON physical scan. Never authenticates, never talks to a service, never issues a token. */
UCLASS()
class MOONRACER_API UMRDevPassportScanService : public UObject, public IMRPassportScanService
{
	GENERATED_BODY()
public:
	enum class EMode : uint8 { OfflineGuestSimulated, Refuse, Unavailable, ReturnLinkedVerified /* a result the dev machine must refuse */, Hold /* completes later */ };
	EMode Mode = EMode::OfflineGuestSimulated;
	int32 ScanCount = 0;
	/** A simulated scan is NOT authentication. Always false; asserted by the tests. */
	static bool ClaimsAuthentication() { return false; }
	virtual void Scan(TFunction<void(const FMRScanResponse&)> Done) override;
	virtual void CancelScan() override;
	/** Hold mode: finish the pending scan. */
	void CompleteHeld(const FMRScanResponse& R);
	bool HasPending() const { return (bool)Pending; }
private:
	TFunction<void(const FMRScanResponse&)> Pending;
};

UCLASS()
class MOONRACER_API UMRDevV2WorldService : public UObject, public IMRWorldService
{
	GENERATED_BODY()
public:
	TSet<FName> UnavailableLocations;
	bool bHold = false;                    // hold LoadLocation until CompleteHeld() (mid-load interruption)
	TArray<FName> LoadLog;
	virtual bool IsLocationAvailable(FName L) override { return !UnavailableLocations.Contains(L); }
	virtual void LoadLocation(FName L, TFunction<void(EMRServiceResult)> Done) override;
	void CompleteHeld(EMRServiceResult R) { if (Pending) { TFunction<void(EMRServiceResult)> F = MoveTemp(Pending); Pending = nullptr; F(R); } }
	bool HasPending() const { return (bool)Pending; }
private:
	TFunction<void(EMRServiceResult)> Pending;
};

UCLASS()
class MOONRACER_API UMRDevV2SpawnService : public UObject, public IMRSpawnService
{
	GENERATED_BODY()
public:
	TSet<FName> FailingSpawns;             // spawn ids that fail
	bool bHold = false;
	TArray<FString> SpawnLog;              // "<location>/<spawn>"
	FName LastLocation, LastSpawn;
	int32 TeleportCount = 0;
	/** Optional graybox placement: when set, the real pawn is moved to the anchor of the spawn id. */
	UWorld* WorldContext = nullptr;
	TMap<FName, FVector> Anchors;          // spawn id -> world location
	virtual void SpawnPlayer(FName Loc, FName Spawn, TFunction<void(EMRServiceResult, FName)> Done) override;
	virtual EMRServiceResult TeleportToSafeSpawn(const FMRSafeSpawn& Spawn) override;
	void CompleteHeld(EMRServiceResult R);
	bool HasPending() const { return (bool)Pending; }
private:
	bool Place(FName Spawn);
	TFunction<void(EMRServiceResult, FName)> Pending; FName PendingSpawn;
};

UCLASS()
class MOONRACER_API UMRDevV2CinematicService : public UObject, public IMRCinematicService
{
	GENERATED_BODY()
public:
	bool bAvailable = true, bPlayerSkips = false, bHold = false;
	int32 PlayCount = 0;
	virtual bool IsCinematicAvailable(FName) override { return bAvailable; }
	virtual void Play(FName, bool, TFunction<void(EMRArrivalOutcome)> Done) override;
	void CompleteHeld(EMRArrivalOutcome O) { if (Pending) { TFunction<void(EMRArrivalOutcome)> F = MoveTemp(Pending); Pending = nullptr; F(O); } }
	bool HasPending() const { return (bool)Pending; }
private:
	TFunction<void(EMRArrivalOutcome)> Pending;
};

/** TEST FIXTURE - NONCANON launch-identity status (same offline-only contract as v1's dev placeholder). */
UCLASS()
class MOONRACER_API UMRDevV2IdentityService : public UObject, public IMRPassportService
{
	GENERATED_BODY()
public:
	EMRPassportStatus Status = EMRPassportStatus::OfflineGuest;
	virtual void GetStatus(TFunction<void(EMRPassportStatus)> Done) override { Done(Status); }
};
