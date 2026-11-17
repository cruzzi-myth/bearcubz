// Moon Racer - DEVELOPMENT-ONLY avatar workflow test driver (Phase 3A).
// Runs only with -MRAvatarTest=<mode>:
//   save    : Avatar Creator -> select -> preview -> reject invalid -> cancel -> confirm -> save (creator map, creator controller)
//   load    : relaunch -> load -> spawn -> verify the saved avatar and that it still animates (spawn map)
//   robust  : missing/bad assets and invalid selections never corrupt or crash the character (spawn map)
// Writes "MRAVT|" log lines and screenshots, then quits.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Avatar/MRAvatarTypes.h"
#include "MRAvatarTestDriver.generated.h"

class AMRPlayerCharacter;
class UMRAvatarCreatorWidget;

UCLASS()
class MOONRACER_API AMRAvatarTestDriver : public AActor
{
	GENERATED_BODY()

public:
	AMRAvatarTestDriver();

protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	struct FStep { float Delay; TFunction<void()> Fn; };

	void BuildSave();
	void BuildLoad();
	void BuildRobust();
	void BuildMouse();
	void BuildMouseReopen();
	void QueueClick(FName Action, FName Param);
	void TickClick();
	void SendPointer(int32 Kind, FVector2D Pos, float WheelDelta = 0.f); // 0=move 1=down 2=up 3=wheel
	void Check(const FString& Name, bool bPass, const FString& Detail = FString());
	void Shot(const FString& Name);
	void Finish();
	AMRPlayerCharacter* Pawn() const;
	UMRAvatarCreatorWidget* Widget() const;
	FString PawnBodyName() const;
	FString PawnSkeletonName() const;
	FString PawnMaterialName(int32 Slot) const;
	int32 AccessoryCount() const;

	struct FPendingClick { FName Action; FName Param; int32 Phase = 0; int32 Wait = 0; int32 Attempts = 0; FVector2D Pos = FVector2D::ZeroVector; };
	TOptional<FPendingClick> Pending;
	FVector2D LastPointer = FVector2D::ZeroVector;
	int32 NumClicks = 0, NumWheel = 0;
	float MouseYawBefore = 0.f, MouseArmBefore = 0.f;

	TArray<FStep> Steps;
	int32 StepIndex = 0;
	float StepTimer = 0.f;
	bool bRunning = false;
	bool bHoldForward = false;
	FString Mode;
	int32 NumPass = 0, NumFail = 0;
	FMRAvatarAppearance Snapshot;
	FString SnapshotBody, SnapshotMat;
	int32 SnapshotAcc = 0;
};
