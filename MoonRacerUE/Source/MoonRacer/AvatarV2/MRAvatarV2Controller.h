// Moon Racer - Avatar Creator V2 DEVELOPMENT game mode + controller (AV2 I1+I2).
// Reachable only through L_MR_AvatarCreatorV2Dev with -MRAvatarV2Dev (never in Shipping, never on the default avatar slot).
// The controller owns the camera (orbit/zoom/views), the session model and the interface shell. It never changes the default map or game mode.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/PlayerController.h"
#include "AvatarV2/MRAvatarV2Camera.h"
#include "MRAvatarV2Controller.generated.h"

class ACameraActor;
class AMRAvatarV2Chamber;
class AMRPlayerCharacter;
class UMRAvatarV2Session;
class UMRAvatarV2Widget;

UCLASS()
class MOONRACER_API AMRAvatarV2GameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AMRAvatarV2GameMode();
	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
	virtual void StartPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
};

UCLASS()
class MOONRACER_API AMRAvatarV2Controller : public APlayerController
{
	GENERATED_BODY()

public:

	AMRAvatarV2Controller();

	bool IsCreatorActive() const { return bActive; }
	const FString& GetRefusalReason() const { return Refusal; }
	UMRAvatarV2Widget* GetWidget() const { return Widget; }
	UMRAvatarV2Session* GetSession() const { return Session; }
	ACameraActor* GetCameraActor() const { return CameraActor; }
	AMRAvatarV2Chamber* GetChamber() const { return Chamber; }
	AMRPlayerCharacter* GetCharacter() const;
	FMRAvatarV2CameraModel& CameraModel() { return Camera; }

	/** Camera commands: "view"(name), "reset_camera", "zoom"(in/out). Only the camera is affected. */
	void CameraCommand(FName Action, FName Param);
	void Orbit(float DYaw, float DPitch) { Camera.Orbit(DYaw, DPitch); }
	void WheelZoom(float Wheel) { Camera.Zoom(-Wheel * 30.f); }
	/** Push the model to the camera actor immediately (also done every tick). */
	void ApplyCamera();
	/** Re-pin the character to the platform if anything moved it. Returns true if a correction was needed. */
	bool EnsureCharacterPinned();

protected:

	virtual void OnPossess(APawn* InPawn) override;
	virtual void PlayerTick(float DeltaTime) override;

private:

	void StartCreator(AMRPlayerCharacter* Pawn);

	UPROPERTY(Transient) TObjectPtr<UMRAvatarV2Widget> Widget;
	UPROPERTY(Transient) TObjectPtr<UMRAvatarV2Session> Session;
	UPROPERTY(Transient) TObjectPtr<ACameraActor> CameraActor;
	UPROPERTY(Transient) TObjectPtr<AMRAvatarV2Chamber> Chamber;
	FMRAvatarV2CameraModel Camera;
	FString Refusal;
	bool bActive = false;
};
