// Moon Racer - DEVELOPMENT-ONLY world test driver for the P5A narrative/interaction foundation. Runs only with -MRNarrTest=<mode>.
//   interact : interaction range/availability, the real E-key path, the dialogue HUD (keyboard via Slate + real mouse), cancel/restart,
//              mission acceptance and the objective tracker. Leaves a mid-mission narrative save behind.
//   resume   : relaunch; verifies save/resume of narrative state and the tracker; finishes the mission.
// All content is TEST FIXTURE - NONCANON. Requires dedicated slots: -MRNarrativeSlot=<name> -MRAvatarSlot=<name>.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MRInteractionTestDriver.generated.h"

class AMRPlayerCharacter;
class UMRInteractorComponent;
class UMRNarrativeSubsystem;
class UMRNarrativeHudWidget;
class AMRDevNpcActor;

UCLASS()
class MOONRACER_API AMRInteractionTestDriver : public AActor
{
	GENERATED_BODY()
public:
	AMRInteractionTestDriver();
protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
private:
	struct FStep { float Delay; TFunction<void()> Fn; };
	void Check(const FString& Name, bool bPass, const FString& Detail = FString());
	void Finish();
	void BuildInteract(); void BuildResume();
	void Add(float Delay, TFunction<void()> Fn) { Steps.Add({ Delay, MoveTemp(Fn) }); }
	bool Setup();
	void TeleportNear(AMRDevNpcActor* Npc, float Dx);
	void PressKeyViaController(const FKey& Key, EInputEvent Ev);
	void SlateKey(const FKey& Key);
	void Pointer(int32 Kind, FVector2D Pos);
	AMRDevNpcActor* FindNpc(FName NpcId) const;
	UMRNarrativeSubsystem* Nar() const;
	AMRPlayerCharacter* Pawn() const;

	TArray<FStep> Steps; int32 StepIndex = 0; float StepTimer = 0.f; bool bRunning = false;
	FString Mode; int32 NumPass = 0, NumFail = 0;
	UPROPERTY() TObjectPtr<UMRInteractorComponent> Interactor;
	FVector2D LastPointer = FVector2D::ZeroVector;
};
