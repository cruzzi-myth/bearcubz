// Moon Racer - DEVELOPMENT placeholder implementations of the onboarding interfaces (Phase 3B P3).
//
// EVERYTHING HERE IS "TEST FIXTURE - NONCANON". It exists only so the onboarding state machine can be built and tested without
// canonical content. No Core geography, NPC record, dialogue, mission or cinematic is defined or implied by these classes.
// All text they produce starts with "TEST FIXTURE - NONCANON". Each service can be switched unavailable to test failure handling.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Engine/DataAsset.h"
#include "Onboarding/MRIntegrationInterfaces.h"
#include "MRDevOnboardingServices.generated.h"

class UWorld;


/** Content IDs the flow asks for. Defaults are fixtures; real IDs will come from the approved registry (blocked: B-01..B-07). */
USTRUCT(BlueprintType)
struct MOONRACER_API FMRFlowContent
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FName ArrivalCinematicId = FName("TEST_FIXTURE_NONCANON_ARRIVAL");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FName CoreLocationId = FName("TEST_FIXTURE_NONCANON_LOCATION");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FName DefaultSpawnId = FName("TEST_FIXTURE_NONCANON_SPAWN");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FName ObjectiveId = FName("TEST_FIXTURE_NONCANON_OBJECTIVE");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FName FirstContactNpcId = FName("TEST_FIXTURE_NONCANON_NPC_A");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FName FirstContactDialogueId = FName("TEST_FIXTURE_NONCANON_DIALOGUE_A");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FName HandoffNpcId = FName("TEST_FIXTURE_NONCANON_NPC_B");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FName HandoffDialogueId = FName("TEST_FIXTURE_NONCANON_DIALOGUE_B");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FName FirstMissionId = FName("TEST_FIXTURE_NONCANON_MISSION");
};

/** Data asset holding the content IDs the flow asks for (fixtures today). The spine/transition structure is code-defined and test-validated. */
UCLASS(BlueprintType)
class MOONRACER_API UMROnboardingFlowAsset : public UPrimaryDataAsset
{
	GENERATED_BODY()
public:
	static const TCHAR* DefaultAssetPath() { return TEXT("/Game/MoonRacer/Onboarding/DA_MR_OnboardingFlow.DA_MR_OnboardingFlow"); }
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FMRFlowContent Content;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Onboarding") FString Label = TEXT("TEST FIXTURE - NONCANON content IDs");
};

UCLASS()
class MOONRACER_API UMRDevPassportService : public UObject, public IMRPassportService
{
	GENERATED_BODY()
public:
	/** Test switch: what the placeholder reports. Default OfflineGuest (offline-first, D-1). */
	EMRPassportStatus Status = EMRPassportStatus::OfflineGuest;
	virtual void GetStatus(TFunction<void(EMRPassportStatus)> Done) override { Done(Status); } // no network, no service
};

UCLASS()
class MOONRACER_API UMRDevAvatarFlowService : public UObject, public IMRAvatarFlowService
{
	GENERATED_BODY()
public:
	virtual bool HasValidConfirmedAvatar(FMRAvatarRef& OutRef) override;
	virtual void OpenAvatarCreator() override { ++CreatorOpenCount; }
	int32 CreatorOpenCount = 0;
	/** Test override: bypass the avatar save subsystem (used by pure-logic tests). */
	TOptional<FMRAvatarRef> ForcedRef;
	UWorld* WorldContext = nullptr;
};

UCLASS()
class MOONRACER_API UMRDevWorldService : public UObject, public IMRWorldService
{
	GENERATED_BODY()
public:
	bool bAvailable = true;        // set false to simulate "missing Core content"
	int32 LoadCount = 0;
	virtual bool IsLocationAvailable(FName) override { return bAvailable; }
	virtual void LoadLocation(FName LocationId, TFunction<void(EMRServiceResult)> Done) override { ++LoadCount; Done(bAvailable ? EMRServiceResult::Ok : EMRServiceResult::Unavailable); }
};

UCLASS()
class MOONRACER_API UMRDevSpawnService : public UObject, public IMRSpawnService
{
	GENERATED_BODY()
public:
	bool bAvailable = true;
	int32 SpawnCount = 0, TeleportCount = 0;
	FName LastRequestedSpawn;
	UWorld* WorldContext = nullptr;   // when set, positions the real pawn at a PlayerStart; when null it only records (pure-logic tests)
	virtual void SpawnPlayer(FName LocationId, FName SpawnPointId, TFunction<void(EMRServiceResult, FName)> Done) override;
	virtual EMRServiceResult TeleportToSafeSpawn(const FMRSafeSpawn& Spawn) override;
};

UCLASS()
class MOONRACER_API UMRDevCinematicService : public UObject, public IMRCinematicService
{
	GENERATED_BODY()
public:
	bool bAvailable = true;
	bool bPlayerSkips = false;
	int32 PlayCount = 0;
	virtual bool IsCinematicAvailable(FName) override { return bAvailable; }
	virtual void Play(FName, bool, TFunction<void(EMRArrivalOutcome)> Done) override
	{
		++PlayCount; // "TEST FIXTURE - NONCANON": no real cinematic exists
		Done(!bAvailable ? EMRArrivalOutcome::SkippedUnavailable : bPlayerSkips ? EMRArrivalOutcome::SkippedByPlayer : EMRArrivalOutcome::Played);
	}
};

UCLASS()
class MOONRACER_API UMRDevInteractionService : public UObject, public IMRInteractionService
{
	GENERATED_BODY()
public:
	TSet<FName> UnavailableNpcs;
	/** If true objectives/interactions complete immediately; if false they wait for NotifyObjectiveReached()/CompleteInteraction(). */
	bool bAutoComplete = true;
	int32 InteractCount = 0;
	virtual void BeginObjective(FName ObjectiveId, TFunction<void(EMRServiceResult)> Done) override;
	virtual bool IsNpcAvailable(FName NpcId) override { return !UnavailableNpcs.Contains(NpcId); }
	virtual void Interact(FName NpcId, TFunction<void(EMRServiceResult)> Done) override { ++InteractCount; Done(IsNpcAvailable(NpcId) ? EMRServiceResult::Ok : EMRServiceResult::Unavailable); }
	void NotifyObjectiveReached();
private:
	TFunction<void(EMRServiceResult)> PendingObjective;
};

UCLASS()
class MOONRACER_API UMRDevDialogueService : public UObject, public IMRDialogueService
{
	GENERATED_BODY()
public:
	TSet<FName> UnavailableGraphs;
	int32 RunCount = 0;
	/** The only text this fixture ever produces. */
	static FString FixtureLine() { return TEXT("TEST FIXTURE - NONCANON: placeholder line, not Moon Racer dialogue."); }
	virtual bool IsDialogueAvailable(FName GraphId) override { return !UnavailableGraphs.Contains(GraphId); }
	virtual void RunDialogue(FName GraphId, TFunction<void(EMRServiceResult, FName)> Done) override;
};

UCLASS()
class MOONRACER_API UMRDevQuestService : public UObject, public IMRQuestService
{
	GENERATED_BODY()
public:
	bool bAvailable = true;
	int32 AcceptCount = 0;
	virtual bool IsQuestAvailable(FName) override { return bAvailable; }
	virtual void OfferAndAccept(FName, TFunction<void(EMRServiceResult, EMRQuestStatus)> Done) override
	{
		if (!bAvailable) { Done(EMRServiceResult::Unavailable, EMRQuestStatus::NotOffered); return; }
		++AcceptCount; Done(EMRServiceResult::Ok, EMRQuestStatus::Active); // accepted only; never completed here (D-6)
	}
};
