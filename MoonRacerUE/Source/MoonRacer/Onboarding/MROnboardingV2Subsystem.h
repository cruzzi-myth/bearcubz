// Moon Racer - owner of the DEVELOPMENT-ONLY v2 onboarding machine (Phase 3B P5B-3B).
// The subsystem is created ONLY when the explicit launch flag -MROnbV2Dev is present and never in a Shipping build, so without the flag nothing of v2
// exists at runtime and the v1 onboarding system is the only one. It never begins the machine by itself and is not wired to any default map or game mode.

#pragma once

#include "CoreMinimal.h"
#include "Containers/Ticker.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Onboarding/MROnboardingV2Machine.h"
#include "MROnboardingV2Subsystem.generated.h"

UCLASS()
class MOONRACER_API UMROnboardingV2Subsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override { return MROnboardingV2Dev::IsAllowed(); }
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	UMROnboardingMachineV2* GetMachine() const { return Machine; }
private:
	bool TickSpawnDriver(float);
	UPROPERTY(Transient) TObjectPtr<UMROnboardingMachineV2> Machine;
	FTSTicker::FDelegateHandle TickHandle;
	FString TestMode;
};
