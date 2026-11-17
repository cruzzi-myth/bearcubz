// Moon Racer — shared humanoid attachment points (non-destructive).
//
// Rigid attachment points are defined as DATA (a bone name + a relative
// transform), not as sockets stored inside Epic's SK_Mannequin / SKM_* assets.
// Any humanoid mesh that shares the Mannequin skeleton can use the same set,
// and no Epic asset is modified. Attaching to a bone name directly is a
// supported engine feature (USceneComponent::AttachToComponent with a bone).

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "MRAttachmentPoints.generated.h"

/** One rigid attachment point on a humanoid skeleton. */
USTRUCT(BlueprintType)
struct FMRAttachmentPointDef
{
	GENERATED_BODY()

	/** Stable ID, e.g. MR_Head_Top. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Attachment")
	FName PointId;

	/** Skeleton bone the point follows. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Attachment")
	FName BoneName;

	/** Offset in the bone's local space. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Attachment")
	FTransform RelativeTransform = FTransform::Identity;

	/** Human-readable purpose (headgear, back accessory, ...). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Attachment")
	FString Purpose;
};

/** Data asset holding the attachment points for one skeleton family. */
UCLASS(BlueprintType)
class MOONRACER_API UMRAttachmentPointSet : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:

	/** Skeleton family this set is authored for (documentation only). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Attachment")
	FString SkeletonFamily = TEXT("MR_Humanoid (UE Mannequin skeleton)");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Attachment")
	TArray<FMRAttachmentPointDef> Points;

	/** Returns the point definition, or nullptr if the ID is unknown. */
	const FMRAttachmentPointDef* FindPoint(FName PointId) const;
};
