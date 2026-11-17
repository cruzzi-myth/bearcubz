// Moon Racer - DEVELOPMENT-ONLY onboarding world test driver (Phase 3B P0/P4). Runs only with -MROnbTest=<mode>.
//   partial   : fresh onboarding; avatar completion via the real avatar-saved event; pauses at FIRST_OBJECTIVE; safe-spawn recovery; quits (interrupted)
//   resume    : relaunch; verifies resume (no replay), finishes the flow, verifies avatar restoration; quits
//   returning : relaunch after completion; expects an immediate FREE_EXPLORE
//   corrupt   : corrupts the newest checkpoint file, then verifies recovery from the older valid checkpoint
// All services are TEST FIXTURE - NONCANON. Uses dedicated slots (-MRProgressSlot / -MRAvatarSlot).

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MROnboardingTestDriver.generated.h"

class UMROnboardingSubsystem;
class AMRPlayerCharacter;

UCLASS()
class MOONRACER_API AMROnboardingTestDriver : public AActor
{
	GENERATED_BODY()
public:
	AMROnboardingTestDriver();
protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
private:
	struct FStep { float Delay; TFunction<void()> Fn; };
	void Check(const FString& Name, bool bPass, const FString& Detail = FString());
	void Finish();
	UMROnboardingSubsystem* Onb() const;
	AMRPlayerCharacter* Pawn() const;
	void BuildPartial(); void BuildResume(); void BuildReturning(); void BuildCorrupt();

	TArray<FStep> Steps; int32 StepIndex = 0; float StepTimer = 0.f; bool bRunning = false;
	FString Mode; int32 NumPass = 0, NumFail = 0;
	FVector PawnStart = FVector::ZeroVector;
};
