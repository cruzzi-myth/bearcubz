// Moon Racer — playable humanoid character (Phase 3A shared humanoid foundation).
//
// DEVELOPMENT NOTE: the body meshes assigned in the Blueprint are Epic's
// Manny/Quinn mannequins. They are development stand-ins only and are NOT
// canonical Moon Racer avatar designs.

#pragma once

#include "CoreMinimal.h"
#include "MoonRacerCharacter.h"
#include "MRPlayerCharacter.generated.h"

class UAnimInstance;
class UMaterialInterface;
class USkeletalMesh;
class UStaticMesh;
class UStaticMeshComponent;
class UMRAttachmentPointSet;
class UMRAvatarCustomizationComponent;

UCLASS(Blueprintable)
class MOONRACER_API AMRPlayerCharacter : public AMoonRacerCharacter
{
	GENERATED_BODY()

public:

	AMRPlayerCharacter();

	/** Humanoid Animation Blueprint class applied to whichever body mesh is active. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category="MR|Humanoid")
	TSoftClassPtr<UAnimInstance> HumanoidAnimClass;

	/** Development body meshes sharing the humanoid skeleton (index 0 is the default). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category="MR|Humanoid")
	TArray<TSoftObjectPtr<USkeletalMesh>> DevBodyMeshes;

	/** Attachment point definitions (bone + offset), shared by all humanoid meshes. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category="MR|Humanoid")
	TObjectPtr<UMRAttachmentPointSet> AttachmentPoints;

	/** Body mesh used when the character spawns (placed preview instances can pick Manny or Quinn). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="MR|Humanoid")
	int32 InitialBodyIndex = 0;

	/** Avatar appearance (species/body/accessories/material) applied through the catalog. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="MR|Avatar")
	TObjectPtr<UMRAvatarCustomizationComponent> AvatarCustomization;

	/** When true, the locally saved avatar appearance is loaded and applied at BeginPlay (off by default). */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category="MR|Avatar")
	bool bLoadSavedAvatarOnBeginPlay = false;

	/** Always true for the mannequin stand-ins. Real avatar meshes must set this false. */
	UPROPERTY(BlueprintReadOnly, Category="MR|Humanoid")
	bool bDevPlaceholderBody = true;

	/** Switch to DevBodyMeshes[Index]. Fails (false) on a bad index, missing asset or skeleton mismatch. */
	UFUNCTION(BlueprintCallable, Category="MR|Humanoid")
	bool SetDevBodyMesh(int32 Index);

	UFUNCTION(BlueprintPure, Category="MR|Humanoid")
	int32 GetDevBodyMeshIndex() const { return CurrentBodyIndex; }

	/** Attach a rigid static mesh at a named attachment point. Returns the component or nullptr (unknown point). */
	UFUNCTION(BlueprintCallable, Category="MR|Customization")
	UStaticMeshComponent* AttachRigidAccessory(FName PointId, UStaticMesh* AccessoryMesh, FVector Scale = FVector(0.15f));

	UFUNCTION(BlueprintCallable, Category="MR|Customization")
	void ClearAccessory(FName PointId);

	UFUNCTION(BlueprintCallable, Category="MR|Customization")
	void ClearAllAccessories();

	/** Replace the material on a body material slot (basic material customization). */
	UFUNCTION(BlueprintCallable, Category="MR|Customization")
	bool SetBodyMaterial(int32 SlotIndex, UMaterialInterface* Material);

	/** World-space transform an attached accessory is expected to have right now (bone * offset). */
	bool GetExpectedAccessoryTransform(FName PointId, FTransform& OutTransform) const;

	UStaticMeshComponent* GetAccessory(FName PointId) const;

	const TMap<FName, TObjectPtr<UStaticMeshComponent>>& GetAccessories() const { return Accessories; }

protected:

	virtual void BeginPlay() override;
	virtual void OnConstruction(const FTransform& Transform) override;

private:

	void ApplyHumanoidSetup();

	UPROPERTY(Transient)
	TMap<FName, TObjectPtr<UStaticMeshComponent>> Accessories;

	int32 CurrentBodyIndex = INDEX_NONE;
};
