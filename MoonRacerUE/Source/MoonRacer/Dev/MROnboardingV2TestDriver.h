// Moon Racer - DEVELOPMENT-ONLY world test driver for the v2 onboarding machine (Phase 3B P5B-3B). Runs only with -MROnbV2Dev -MROnbV2Test=<mode>.
//   partial   : fresh player; avatar completion through the REAL avatar-saved event; graybox station and tavern approach; an OPTIONAL NPC conversation through
//               the real interactor; the Tavian-encounter fixture dialogue is started and then the process quits MID-DIALOGUE (interruption)
//   resume    : relaunch; resumes at TAVIAN_ENCOUNTER from the v2 checkpoint, restarts the dialogue without repeating one-time effects, accepts the fixture mission,
//               passes the departure gate, simulated offline scan, transit, Core arrival at the graybox Core location, FREE_EXPLORE
//   returning : relaunch after completion; expects an immediate FREE_EXPLORE with nothing replayed
// Locations are primitive TEST_FIXTURE_NONCANON graybox slabs (not canonical geography). Requires dedicated slots:
//   -MRProgressSlot=<n> -MRAvatarSlot=<n> -MRNarrativeSlot=<n>. The driver is spawned by UMROnboardingV2Subsystem, which exists only when the dev flag is present.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MROnboardingV2TestDriver.generated.h"

class UMROnboardingMachineV2;
class UMRNarrativeSubsystem;
class UMRInteractorComponent;
class AMRPlayerCharacter;

UCLASS()
class MOONRACER_API AMROnboardingV2TestDriver : public AActor
{
	GENERATED_BODY()
public:
	AMROnboardingV2TestDriver();
	/** Called by the subsystem before BeginPlay. */
	FString RequestedMode;
protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
private:
	struct FStep { float Delay; TFunction<void()> Fn; };
	void Check(const FString& Name, bool bPass, const FString& Detail = FString());
	void Finish();
	void Add(float Delay, TFunction<void()> Fn) { Steps.Add({ Delay, MoveTemp(Fn) }); }
	bool Setup(bool bLoadNarrative);
	void BuildGraybox();
	AMRPlayerCharacter* Pawn() const;
	float DistTo(FName SpawnId) const;
	void BuildPartial(); void BuildResume(); void BuildReturning();

	TArray<FStep> Steps; int32 StepIndex = 0; float StepTimer = 0.f; bool bRunning = false;
	FString Mode; int32 NumPass = 0, NumFail = 0;
	UPROPERTY() TObjectPtr<UMROnboardingMachineV2> Machine;
	UPROPERTY() TObjectPtr<UMRNarrativeSubsystem> Nar;
	UPROPERTY() TObjectPtr<UMRInteractorComponent> Interactor;
	TMap<FName, FVector> Anchors;
	FVector PawnStart = FVector::ZeroVector;
	int32 WritesBefore = 0;
};
