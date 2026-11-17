#include "Onboarding/MRDevOnboardingServices.h"
#include "Avatar/MRAvatarCustomizationComponent.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerStart.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Kismet/GameplayStatics.h"
#include "MoonRacer.h"

bool UMRDevAvatarFlowService::HasValidConfirmedAvatar(FMRAvatarRef& OutRef)
{
	if (ForcedRef.IsSet()) { OutRef = ForcedRef.GetValue(); return OutRef.IsSet(); }
	UGameInstance* GI = WorldContext ? WorldContext->GetGameInstance() : (GetOuter() ? Cast<UGameInstance>(GetOuter()) : nullptr);
	UMRAvatarSaveSubsystem* Save = GI ? GI->GetSubsystem<UMRAvatarSaveSubsystem>() : nullptr;
	if (!Save || !Save->HasSavedAppearance()) return false;
	FMRAvatarLoadReport R;
	const FMRAvatarAppearance A = Save->LoadAppearance(R);
	if (!R.bFoundSave) return false;
	OutRef.AvatarId = A.AvatarId; OutRef.Revision = A.Revision;
	return OutRef.IsSet();
}

void UMRDevSpawnService::SpawnPlayer(FName LocationId, FName SpawnPointId, TFunction<void(EMRServiceResult, FName)> Done)
{
	++SpawnCount; LastRequestedSpawn = SpawnPointId;
	if (!bAvailable) { Done(EMRServiceResult::Unavailable, NAME_None); return; }
	if (WorldContext)
	{
		AMRPlayerCharacter* Pawn = Cast<AMRPlayerCharacter>(UGameplayStatics::GetPlayerPawn(WorldContext, 0));
		if (!Pawn || !Pawn->AvatarCustomization || !Pawn->AvatarCustomization->HasApplied()) { Done(EMRServiceResult::Failed, NAME_None); return; }
		for (TActorIterator<APlayerStart> It(WorldContext); It; ++It)
		{
			if (It->PlayerStartTag == SpawnPointId || It->PlayerStartTag.IsNone()) { Pawn->SetActorLocation(It->GetActorLocation() + FVector(0, 0, 100)); break; }
		}
	}
	Done(EMRServiceResult::Ok, SpawnPointId);
}

EMRServiceResult UMRDevSpawnService::TeleportToSafeSpawn(const FMRSafeSpawn& Spawn)
{
	++TeleportCount;
	if (!bAvailable || !Spawn.IsSet()) return EMRServiceResult::Unavailable;
	if (WorldContext)
	{
		AMRPlayerCharacter* Pawn = Cast<AMRPlayerCharacter>(UGameplayStatics::GetPlayerPawn(WorldContext, 0));
		if (!Pawn) return EMRServiceResult::Failed;
		TActorIterator<APlayerStart> It(WorldContext);
		if (It) { Pawn->SetActorLocation(It->GetActorLocation() + FVector(0, 0, 100)); }
	}
	return EMRServiceResult::Ok;
}

void UMRDevInteractionService::BeginObjective(FName, TFunction<void(EMRServiceResult)> Done)
{
	if (bAutoComplete) { Done(EMRServiceResult::Ok); return; }
	PendingObjective = MoveTemp(Done);
}

void UMRDevInteractionService::NotifyObjectiveReached()
{
	if (PendingObjective) { TFunction<void(EMRServiceResult)> F = MoveTemp(PendingObjective); PendingObjective = nullptr; F(EMRServiceResult::Ok); }
}

void UMRDevDialogueService::RunDialogue(FName GraphId, TFunction<void(EMRServiceResult, FName)> Done)
{
	++RunCount;
	if (!IsDialogueAvailable(GraphId)) { Done(EMRServiceResult::Unavailable, NAME_None); return; }
	UE_LOG(LogMoonRacer, Display, TEXT("MRONB|DIALOGUE|%s|%s"), *GraphId.ToString(), *FixtureLine());
	Done(EMRServiceResult::Ok, FName("TEST_FIXTURE_NONCANON_END"));
}
