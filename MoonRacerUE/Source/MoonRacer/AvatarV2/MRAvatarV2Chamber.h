// Moon Racer - Avatar Creator V2 DEVELOPMENT cryosleep-chamber graybox (AV2 I1).
// A temporary, primitives-only chamber aboard the Galactic Space Station, built at BeginPlay from engine primitives and clearly
// labelled development materials. It is NOT a production environment: it defines no canonical facility name, location id or
// geography, and carries no signage naming The Core. The facility label is a noncanon placeholder.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MRAvatarV2Chamber.generated.h"

class ACharacter;
class UMaterialInstanceDynamic;
class UMaterialInterface;
class UStaticMeshComponent;
class UTextRenderComponent;

USTRUCT()
struct FMRV2ChamberStats
{
	GENERATED_BODY()
	int32 NumMeshes = 0;
	int32 NumLights = 0;
	int32 NumShadowCastingLights = 0;
	int32 NumTexts = 0;
	int32 NumAnimated = 0;
	bool bUsingDevMaterials = false;
};

UCLASS()
class MOONRACER_API AMRAvatarV2Chamber : public AActor
{
	GENERATED_BODY()

public:

	AMRAvatarV2Chamber();

	/** Placeholder label shown in the chamber. Deliberately not a canonical facility name. */
	static FString PlaceholderFacilityLabel();

	/** Height of the character platform's top surface above the chamber origin (cm). */
	static constexpr float PlatformTopZ = 30.f;
	/** Approximate inner radius of the pod glass (cm). */
	static constexpr float PodInnerRadius = 80.f;

	FVector GetCharacterFeet() const { return GetActorLocation() + FVector(0.f, 0.f, PlatformTopZ); }
	/** Yaw the character faces (towards +X of the chamber). */
	float GetCharacterFacingYaw() const { return GetActorRotation().Yaw; }
	/** Stand a character on the platform centre, facing the front camera, with movement disabled. Idempotent. */
	void PlaceCharacter(ACharacter* Character) const;
	/** Fade the pod glass as a close-up camera approaches, so the glass never obscures the face. */
	void SetGlassOpacityForCameraDistance(float DistanceCm);

	const FMRV2ChamberStats& GetStats() const { return Stats; }
	FString AllSignageText() const;
	bool IsBuilt() const { return bBuilt; }

	void Build();

protected:

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:

	enum class EKind : uint8 { Lit, Emissive, Translucent };

	UStaticMeshComponent* AddMesh(const TCHAR* ShapePath, const FVector& Loc, const FRotator& Rot, const FVector& SizeCm, EKind Kind, const FLinearColor& Color, float Emissive = 0.f, float Opacity = 1.f, bool bCollide = false, bool bShadow = false, bool bAnimate = false);
	UMaterialInstanceDynamic* MakeMID(EKind Kind, const FLinearColor& Color, float Emissive, float Opacity);
	void AddText(const FString& Text, const FVector& Loc, const FRotator& Rot, float Size, const FColor& Color);
	void AddLights();
	void BuildPod();
	void BuildSupports();
	void BuildRoom();
	void BuildProps();
	void BuildMistAndHolo();

	UPROPERTY(Transient) TObjectPtr<USceneComponent> Root;
	UPROPERTY(Transient) TArray<TObjectPtr<UStaticMeshComponent>> Meshes;
	UPROPERTY(Transient) TArray<TObjectPtr<UMaterialInstanceDynamic>> Mids;
	UPROPERTY(Transient) TObjectPtr<UMaterialInstanceDynamic> GlassMid;
	UPROPERTY(Transient) TArray<TObjectPtr<UTextRenderComponent>> Texts;
	UPROPERTY(Transient) TArray<TObjectPtr<UStaticMeshComponent>> Spinners;     // slow ring rotation
	UPROPERTY(Transient) TArray<TObjectPtr<UStaticMeshComponent>> Mist;         // drifting vapor discs
	UPROPERTY(Transient) TArray<TObjectPtr<UMaterialInstanceDynamic>> PulseMids;
	TArray<float> PulseBase;
	TArray<float> MistBaseOpacity;
	UPROPERTY(Transient) TObjectPtr<UMaterialInterface> LitMat;
	UPROPERTY(Transient) TObjectPtr<UMaterialInterface> EmissiveMat;
	UPROPERTY(Transient) TObjectPtr<UMaterialInterface> TranslucentMat;
	FMRV2ChamberStats Stats;
	float Clock = 0.f;
	bool bBuilt = false;
};
