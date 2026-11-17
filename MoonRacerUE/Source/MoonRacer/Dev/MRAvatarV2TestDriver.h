// Moon Racer - DEVELOPMENT-ONLY Avatar Creator V2 world test driver (AV2 I1+I2). Runs only with -MRAvatarV2Dev and -MRAv2Test=<mode>:
//   customize : chamber, character placement, camera, six stages / 14 categories, functional edits, disabled controls, save (dev slot)
//   restore   : relaunch -> the dev-slot save is restored; invalid ids / missing assets are rejected without changing the character
//   interrupt : a half-written temp file and a truncated slot never corrupt anything
//   refuse    : launched on the protected default slot -> the creator refuses and writes nothing
// Logs "MRAV2T|" lines (and screenshots unless -MRNoShots), then quits.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MRAvatarV2TestDriver.generated.h"

class AMRAvatarV2Controller;
class AMRPlayerCharacter;

UCLASS()
class MOONRACER_API AMRAvatarV2TestDriver : public AActor
{
	GENERATED_BODY()

public:
	AMRAvatarV2TestDriver();
	FString RequestedMode;

protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	struct FStep { float Delay; TFunction<void()> Fn; };

	void BuildCustomize();
	void BuildRestore();
	void BuildInterrupt();
	void BuildRefuse();
	void Check(const FString& Name, bool bPass, const FString& Detail = FString());
	void Shot(const FString& Name);
	void Finish();
	AMRAvatarV2Controller* Ctl() const;
	AMRPlayerCharacter* Pawn() const;
	FString BodyName() const;
	FString MatName(int32 Slot = 0) const;
	int32 AccCount() const;

	TArray<FStep> Steps;
	int32 StepIndex = 0;
	float StepTimer = 0.f, WaitForCreator = 0.f;
	bool bRunning = false, bStarted = false;
	FString Mode;
	int32 NumPass = 0, NumFail = 0;
};
