#include "Humanoid/MRPlayerCharacter.h"
#include "Humanoid/MRAttachmentPoints.h"
#include "Animation/AnimInstance.h"
#include "Animation/Skeleton.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "Avatar/MRAvatarCustomizationComponent.h"
#include "MoonRacer.h"

AMRPlayerCharacter::AMRPlayerCharacter()
{
	// The shared locomotion Blend Space (BS_Idle_Walk_Run) is authored with walk at 300 and
	// jog at 600 cm/s on its speed axis. The template character tops out at 500, which would
	// never reach the full jog clip, so the humanoid foundation runs at 600.
	GetCharacterMovement()->MaxWalkSpeed = 600.f;

	AvatarCustomization = CreateDefaultSubobject<UMRAvatarCustomizationComponent>(TEXT("AvatarCustomization"));

	// The Mannequin mesh is authored facing +Y with its origin at the feet; the
	// capsule is 96 half-height, so drop the mesh to the capsule bottom and
	// rotate it to face the pawn's forward axis (same placement the template uses).
	if (USkeletalMeshComponent* BodyMesh = GetMesh())
	{
		BodyMesh->SetRelativeLocationAndRotation(FVector(0.f, 0.f, -96.f), FRotator(0.f, -90.f, 0.f));
		BodyMesh->SetAnimationMode(EAnimationMode::AnimationBlueprint);
	}
}

void AMRPlayerCharacter::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	// Makes the Blueprint viewport and level editor show the configured body.
	ApplyHumanoidSetup();
}

void AMRPlayerCharacter::BeginPlay()
{
	Super::BeginPlay();
	if (CurrentBodyIndex == INDEX_NONE)
	{
		ApplyHumanoidSetup();
	}
	if (bLoadSavedAvatarOnBeginPlay && AvatarCustomization)
	{
		AvatarCustomization->LoadAndApplySaved();
	}
}

void AMRPlayerCharacter::ApplyHumanoidSetup()
{
	if (DevBodyMeshes.Num() > 0)
	{
		SetDevBodyMesh(CurrentBodyIndex == INDEX_NONE ? FMath::Max(InitialBodyIndex, 0) : CurrentBodyIndex);
	}
}

bool AMRPlayerCharacter::SetDevBodyMesh(int32 Index)
{
	USkeletalMeshComponent* BodyMesh = GetMesh();
	if (!BodyMesh || !DevBodyMeshes.IsValidIndex(Index))
	{
		UE_LOG(LogMoonRacer, Warning, TEXT("SetDevBodyMesh: invalid index %d (have %d)"), Index, DevBodyMeshes.Num());
		return false;
	}

	USkeletalMesh* NewMesh = DevBodyMeshes[Index].LoadSynchronous();
	if (!NewMesh)
	{
		UE_LOG(LogMoonRacer, Warning, TEXT("SetDevBodyMesh: body mesh %d is missing or failed to load (%s)"), Index, *DevBodyMeshes[Index].ToString());
		return false;
	}

	// All humanoid bodies must share the skeleton the animation system is authored for.
	if (USkeletalMesh* Existing = BodyMesh->GetSkeletalMeshAsset())
	{
		if (Existing->GetSkeleton() != NewMesh->GetSkeleton())
		{
			UE_LOG(LogMoonRacer, Error, TEXT("SetDevBodyMesh: %s does not share the active skeleton - rejected"), *NewMesh->GetName());
			return false;
		}
	}

	BodyMesh->SetSkeletalMeshAsset(NewMesh);
	// Material overrides belong to the previous body; the new body starts from its own default materials.
	BodyMesh->EmptyOverrideMaterials();
	CurrentBodyIndex = Index;

	if (!HumanoidAnimClass.IsNull())
	{
		if (UClass* AnimClass = HumanoidAnimClass.LoadSynchronous())
		{
			BodyMesh->SetAnimationMode(EAnimationMode::AnimationBlueprint);
			BodyMesh->SetAnimInstanceClass(AnimClass);
		}
	}

	// Existing accessories follow bones by name and survive the swap; re-attach to the new component state.
	for (const TPair<FName, TObjectPtr<UStaticMeshComponent>>& Pair : Accessories)
	{
		if (Pair.Value)
		{
			if (const FMRAttachmentPointDef* Def = AttachmentPoints ? AttachmentPoints->FindPoint(Pair.Key) : nullptr)
			{
				Pair.Value->AttachToComponent(BodyMesh, FAttachmentTransformRules::SnapToTargetNotIncludingScale, Def->BoneName);
				Pair.Value->SetRelativeTransform(Def->RelativeTransform);
			}
		}
	}
	return true;
}

UStaticMeshComponent* AMRPlayerCharacter::AttachRigidAccessory(FName PointId, UStaticMesh* AccessoryMesh, FVector Scale)
{
	USkeletalMeshComponent* BodyMesh = GetMesh();
	const FMRAttachmentPointDef* Def = AttachmentPoints ? AttachmentPoints->FindPoint(PointId) : nullptr;
	if (!BodyMesh || !Def || !AccessoryMesh)
	{
		UE_LOG(LogMoonRacer, Warning, TEXT("AttachRigidAccessory: unknown point '%s' or missing mesh"), *PointId.ToString());
		return nullptr;
	}
	if (!BodyMesh->DoesSocketExist(Def->BoneName)) // accepts bones and sockets
	{
		UE_LOG(LogMoonRacer, Error, TEXT("AttachRigidAccessory: bone/socket '%s' for point '%s' not found on current body mesh"), *Def->BoneName.ToString(), *PointId.ToString());
		return nullptr;
	}

	ClearAccessory(PointId);

	UStaticMeshComponent* Comp = NewObject<UStaticMeshComponent>(this, NAME_None, RF_Transient);
	Comp->SetStaticMesh(AccessoryMesh);
	Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Comp->SetMobility(EComponentMobility::Movable);
	Comp->RegisterComponent();
	Comp->AttachToComponent(BodyMesh, FAttachmentTransformRules::SnapToTargetNotIncludingScale, Def->BoneName);
	FTransform Rel = Def->RelativeTransform;
	Rel.SetScale3D(Rel.GetScale3D() * Scale);
	Comp->SetRelativeTransform(Rel);
	Accessories.Add(PointId, Comp);
	return Comp;
}

void AMRPlayerCharacter::ClearAccessory(FName PointId)
{
	if (TObjectPtr<UStaticMeshComponent>* Found = Accessories.Find(PointId))
	{
		if (*Found)
		{
			(*Found)->DestroyComponent();
		}
		Accessories.Remove(PointId);
	}
}

void AMRPlayerCharacter::ClearAllAccessories()
{
	for (TPair<FName, TObjectPtr<UStaticMeshComponent>>& Pair : Accessories)
	{
		if (Pair.Value)
		{
			Pair.Value->DestroyComponent();
		}
	}
	Accessories.Empty();
}

bool AMRPlayerCharacter::SetBodyMaterial(int32 SlotIndex, UMaterialInterface* Material)
{
	USkeletalMeshComponent* BodyMesh = GetMesh();
	if (!BodyMesh || !Material || SlotIndex < 0 || SlotIndex >= BodyMesh->GetNumMaterials())
	{
		return false;
	}
	BodyMesh->SetMaterial(SlotIndex, Material);
	return true;
}

bool AMRPlayerCharacter::GetExpectedAccessoryTransform(FName PointId, FTransform& OutTransform) const
{
	const USkeletalMeshComponent* BodyMesh = GetMesh();
	const FMRAttachmentPointDef* Def = AttachmentPoints ? AttachmentPoints->FindPoint(PointId) : nullptr;
	if (!BodyMesh || !Def)
	{
		return false;
	}
	// Bone world transform (current animated pose) composed with the point's offset (unscaled).
	FTransform Offset = Def->RelativeTransform;
	Offset.SetScale3D(FVector::OneVector);
	OutTransform = Offset * BodyMesh->GetSocketTransform(Def->BoneName, RTS_World);
	return true;
}

UStaticMeshComponent* AMRPlayerCharacter::GetAccessory(FName PointId) const
{
	const TObjectPtr<UStaticMeshComponent>* Found = Accessories.Find(PointId);
	return Found ? Found->Get() : nullptr;
}
