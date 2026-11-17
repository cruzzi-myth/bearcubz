#include "Onboarding/MROnboardingV2Subsystem.h"
#include "Dev/MROnboardingV2TestDriver.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "MoonRacer.h"

void UMROnboardingV2Subsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Machine = NewObject<UMROnboardingMachineV2>(this);   // services are installed by the dev driver/test that uses it; the machine is NOT begun here
	UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|SUBSYSTEM|v2 development path available (flag -%s present); v1 remains the default flow"), MROnboardingV2Dev::FlagName);
	// -MROnbV2Test=<mode> (development only): spawn the world test driver once a game world with a player pawn exists
	if (FParse::Value(FCommandLine::Get(), TEXT("MROnbV2Test="), TestMode) && !TestMode.IsEmpty())
		TickHandle = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateUObject(this, &UMROnboardingV2Subsystem::TickSpawnDriver), 0.25f);
}

void UMROnboardingV2Subsystem::Deinitialize()
{
	if (TickHandle.IsValid()) FTSTicker::GetCoreTicker().RemoveTicker(TickHandle);
	Super::Deinitialize();
}

bool UMROnboardingV2Subsystem::TickSpawnDriver(float)
{
	UGameInstance* GI = GetGameInstance(); UWorld* W = GI ? GI->GetWorld() : nullptr;
	if (!W || !W->HasBegunPlay() || !(W->IsGameWorld()) || !UGameplayStatics::GetPlayerPawn(W, 0)) return true;   // keep waiting
	AMROnboardingV2TestDriver* D = W->SpawnActorDeferred<AMROnboardingV2TestDriver>(AMROnboardingV2TestDriver::StaticClass(), FTransform::Identity);
	if (D) { D->RequestedMode = TestMode; D->FinishSpawning(FTransform::Identity); }
	return false;   // once
}
