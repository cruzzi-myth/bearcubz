// Moon Racer — DEVELOPMENT-ONLY animation foundation test driver.
//
// Drives the possessed AMRPlayerCharacter through idle -> walk -> jog -> jump ->
// fall -> land, for every dev body mesh (Manny, Quinn), with rigid accessories
// attached at every attachment point, and writes machine-readable
// "MRTEST|" lines to the log plus screenshots. It runs only when the process
// was started with -MRAnimTest, or bAutoRun is set on the placed actor.
// It has no effect on shipping gameplay.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MRAnimationTestDriver.generated.h"

class AMRPlayerCharacter;

UCLASS()
class MOONRACER_API AMRAnimationTestDriver : public AActor
{
	GENERATED_BODY()

public:

	AMRAnimationTestDriver();

	/** Run automatically at BeginPlay (also enabled by the -MRAnimTest command-line switch). */
	UPROPERTY(EditAnywhere, Category="MR|Test")
	bool bAutoRun = false;

	/** Quit the game when the run completes. */
	UPROPERTY(EditAnywhere, Category="MR|Test")
	bool bQuitWhenDone = true;

	/** Save screenshots. */
	UPROPERTY(EditAnywhere, Category="MR|Test")
	bool bTakeScreenshots = true;

protected:

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:

	enum class EPhase : uint8
	{
		Wait,
		Idle,
		Walk,
		Jog,
		Jump,
		AccessoryIdle,
		AccessoryWalk,
		AccessoryJog,
		AccessoryJump,
		Materials,
		Tune,
		NextBody,
		Finish,
		Done
	};

	void BeginPhase(EPhase NewPhase);
	void SampleAndLog(const TCHAR* Tag);
	void UpdateAccessoryError();
	void AttachTinted(AMRPlayerCharacter* P, const struct FMRAttachmentPointDef& Def, int32 ShapeIndex, int32& Count);
	void Check(const FString& Name, bool bPassed, const FString& Detail);
	void Shot(const FString& Name);
	FString StateNames() const;
	float ReadFloatVar(const TCHAR* Name, bool& bFound) const;
	bool ReadBoolVar(const TCHAR* Name, bool& bFound) const;
	void FinishRun();

	UFUNCTION()
	void OnPawnHit(UPrimitiveComponent* HitComp, AActor* Other, UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit);
	int32 HitLogCount = 0;

	UFUNCTION()
	void OnPawnLanded(const FHitResult& Hit);

	TWeakObjectPtr<AMRPlayerCharacter> Pawn;
	EPhase Phase = EPhase::Wait;
	float PhaseTime = 0.f;
	float LogAccum = 0.f;
	int32 BodyIndex = 0;
	bool bRunning = false;
	FVector StartLocation = FVector::ZeroVector;
	FRotator StartRotation = FRotator::ZeroRotator;

	// per-phase evidence
	float MaxSpeed = 0.f;
	float MinSpeed = 1e9f;
	float MaxZVel = 0.f;
	bool bSawFalling = false;
	bool bLanded = false;
	bool bJumpRequested = false;
	float JumpStartTime = 0.f;
	float LandedAtPhaseTime = -1.f;
	TSet<FString> StatesSeen;
	float MaxAccessoryError = 0.f;
	int32 AccessoryCount = 0;
	bool bShotAirborne = false;
	bool bShotFall = false;
	bool bShotLand = false;
	int32 TuneStep = 0;
	bool bTuneRot = false;

	// overall results
	int32 NumPass = 0;
	int32 NumFail = 0;
};
