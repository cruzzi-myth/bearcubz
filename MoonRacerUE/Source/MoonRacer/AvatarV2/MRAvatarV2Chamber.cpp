#include "AvatarV2/MRAvatarV2Chamber.h"
#include "AvatarV2/MRAvatarV2Gate.h"
#include "Components/PointLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Engine/PostProcessVolume.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Engine/World.h"
#include "UObject/ConstructorHelpers.h"
#include "MoonRacer.h"

namespace
{
	constexpr float ManualExposureEV = 5.0f;
	constexpr float EmissiveScale = 0.35f;   // keeps the dev glow subordinate to the character
	const TCHAR* Cube = TEXT("/Engine/BasicShapes/Cube.Cube");
	const TCHAR* Cyl = TEXT("/Engine/BasicShapes/Cylinder.Cylinder");
	const TCHAR* Sph = TEXT("/Engine/BasicShapes/Sphere.Sphere");
	const TCHAR* Pln = TEXT("/Engine/BasicShapes/Plane.Plane");

	const FLinearColor Dark(0.012f, 0.014f, 0.022f), Steel(0.045f, 0.05f, 0.065f), Panel(0.02f, 0.025f, 0.04f);
	const FLinearColor Cyan(0.f, 0.75f, 1.f), Violet(0.5f, 0.1f, 1.f), Magenta(1.f, 0.1f, 0.6f), Gold(1.f, 0.62f, 0.12f);
}

FString AMRAvatarV2Chamber::PlaceholderFacilityLabel() { return TEXT("STATION FACILITY [NAME PENDING CANON]"); }

AMRAvatarV2Chamber::AMRAvatarV2Chamber()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
}

void AMRAvatarV2Chamber::BeginPlay()
{
	Super::BeginPlay();
	if (MRAvatarV2Dev::IsAllowed()) Build();   // the map actor stays inert unless the development flag is present (and never in Shipping)
}

UMaterialInstanceDynamic* AMRAvatarV2Chamber::MakeMID(EKind Kind, const FLinearColor& Color, float Emissive, float Opacity)
{
	UMaterialInterface* Base = Kind == EKind::Lit ? LitMat.Get() : Kind == EKind::Emissive ? EmissiveMat.Get() : TranslucentMat.Get();
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Base, this);
	if (!M) return nullptr;
	M->SetVectorParameterValue(TEXT("Color"), Color);
	M->SetScalarParameterValue(TEXT("Emissive"), Emissive * EmissiveScale);
	M->SetScalarParameterValue(TEXT("Opacity"), Opacity);
	Mids.Add(M);
	return M;
}

UStaticMeshComponent* AMRAvatarV2Chamber::AddMesh(const TCHAR* ShapePath, const FVector& Loc, const FRotator& Rot, const FVector& SizeCm, EKind Kind, const FLinearColor& Color, float Emissive, float Opacity, bool bCollide, bool bShadow, bool bAnimate)
{
	UStaticMesh* Shape = LoadObject<UStaticMesh>(nullptr, ShapePath);
	if (!Shape) return nullptr;
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetStaticMesh(Shape);
	C->SetMobility(EComponentMobility::Movable);
	C->SetupAttachment(Root);
	C->SetRelativeLocation(Loc); C->SetRelativeRotation(Rot); C->SetRelativeScale3D(SizeCm / 100.f);
	C->SetCastShadow(bShadow);
	C->SetCollisionEnabled(bCollide ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
	if (bCollide) C->SetCollisionResponseToAllChannels(ECR_Block);
	if (UMaterialInstanceDynamic* M = MakeMID(Kind, Color, Emissive, Opacity))
	{
		C->SetMaterial(0, M);
		if (bAnimate && Emissive > 0.f) { PulseMids.Add(M); PulseBase.Add(Emissive * EmissiveScale); }
	}
	C->RegisterComponent();
	Meshes.Add(C);
	++Stats.NumMeshes;
	return C;
}

void AMRAvatarV2Chamber::AddText(const FString& Text, const FVector& Loc, const FRotator& Rot, float Size, const FColor& Color)
{
	UTextRenderComponent* T = NewObject<UTextRenderComponent>(this);
	T->SetupAttachment(Root);
	T->SetText(FText::FromString(Text));
	T->SetWorldSize(Size);
	T->SetTextRenderColor(Color);
	T->SetHorizontalAlignment(EHTA_Center);
	T->SetRelativeLocation(Loc); T->SetRelativeRotation(Rot);
	T->SetCastShadow(false);
	T->RegisterComponent();
	Texts.Add(T);
	++Stats.NumTexts;
}

FString AMRAvatarV2Chamber::AllSignageText() const
{
	FString S;
	for (const UTextRenderComponent* T : Texts) S += T->Text.ToString() + TEXT("\n");
	return S;
}

void AMRAvatarV2Chamber::Build()
{
	if (bBuilt) return;
	bBuilt = true;
	// Development materials (created by Scripts/Editor/mr_create_avatar_v2_dev_map.py). If absent, fall back to the engine basic shape material.
	auto Load = [](const TCHAR* P) { return Cast<UMaterialInterface>(FSoftObjectPath(P).TryLoad()); };
	LitMat = Load(TEXT("/Game/MoonRacer/AvatarV2Dev/M_MR_AV2Dev_Lit.M_MR_AV2Dev_Lit"));
	EmissiveMat = Load(TEXT("/Game/MoonRacer/AvatarV2Dev/M_MR_AV2Dev_Emissive.M_MR_AV2Dev_Emissive"));
	TranslucentMat = Load(TEXT("/Game/MoonRacer/AvatarV2Dev/M_MR_AV2Dev_Translucent.M_MR_AV2Dev_Translucent"));
	Stats.bUsingDevMaterials = LitMat && EmissiveMat && TranslucentMat;
	UMaterialInterface* Fallback = Cast<UMaterialInterface>(FSoftObjectPath(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")).TryLoad());
	if (!LitMat) LitMat = Fallback;
	if (!EmissiveMat) EmissiveMat = Fallback;
	if (!TranslucentMat) TranslucentMat = Fallback;
	if (!LitMat) { UE_LOG(LogMoonRacer, Error, TEXT("MRAV2|CHAMBER|no usable material; chamber not built")); bBuilt = false; return; }

	if (UWorld* W = GetWorld())   // fixed exposure + restrained bloom so the character, not the glow, dominates
	{
		if (APostProcessVolume* V = W->SpawnActor<APostProcessVolume>())
		{
			V->bUnbound = true;
			V->Settings.bOverride_BloomIntensity = true; V->Settings.BloomIntensity = 0.25f;
			V->Settings.bOverride_AutoExposureMethod = true; V->Settings.AutoExposureMethod = EAutoExposureMethod::AEM_Manual;
			V->Settings.bOverride_AutoExposureBias = true; float EV = ManualExposureEV; FParse::Value(FCommandLine::Get(), TEXT("MRAV2EV="), EV);   // dev tuning hook
			V->Settings.AutoExposureBias = EV;
			V->Settings.bOverride_VignetteIntensity = true; V->Settings.VignetteIntensity = 0.5f;
		}
	}
	BuildRoom(); BuildPod(); BuildSupports(); BuildProps(); BuildMistAndHolo(); AddLights();
	AddText(TEXT("AVATAR CREATOR V2 - DEV GRAYBOX\n") + PlaceholderFacilityLabel() + TEXT("\nNONCANON PLACEHOLDER GEOMETRY"), FVector(-640.f, 0.f, 470.f), FRotator(0.f, 0.f, 0.f), 26.f, FColor(0, 200, 255));
	AddText(TEXT("CRYOSLEEP POD (DEV PRIMITIVE)"), FVector(-300.f, -150.f, 360.f), FRotator(0.f, 0.f, 0.f), 12.f, FColor(200, 160, 255));
	UE_LOG(LogMoonRacer, Display, TEXT("MRAV2|CHAMBER|built meshes=%d lights=%d shadowLights=%d texts=%d animated=%d devMaterials=%d"), Stats.NumMeshes, Stats.NumLights, Stats.NumShadowCastingLights, Stats.NumTexts, Stats.NumAnimated, Stats.bUsingDevMaterials);
}

void AMRAvatarV2Chamber::BuildPod()
{
	// Platform + ring-lit pedestal, glass cylinder and overhead collar. Origin = platform centre; platform top = PlatformTopZ.
	AddMesh(Cyl, FVector(0, 0, PlatformTopZ * 0.5f), FRotator::ZeroRotator, FVector(260, 260, PlatformTopZ), EKind::Lit, Steel, 0, 1, true);
	AddMesh(Cyl, FVector(0, 0, PlatformTopZ + 1.f), FRotator::ZeroRotator, FVector(212, 212, 2), EKind::Emissive, Cyan, 9.f, 1, false, false, true);   // emissive floor ring (annulus)
	AddMesh(Cyl, FVector(0, 0, PlatformTopZ + 2.f), FRotator::ZeroRotator, FVector(184, 184, 3), EKind::Lit, Dark);
	AddMesh(Cyl, FVector(0, 0, PlatformTopZ * 0.5f + 12.f), FRotator::ZeroRotator, FVector(300, 300, 8), EKind::Lit, Dark);
	AddMesh(Cyl, FVector(0, 0, PlatformTopZ - 4.f), FRotator::ZeroRotator, FVector(292, 292, 3), EKind::Emissive, Violet, 6.f, 1, false, false, true);   // base glow rim
	// Glass (translucent, no collision).
	if (UStaticMeshComponent* G = AddMesh(Cyl, FVector(0, 0, PlatformTopZ + 135.f), FRotator::ZeroRotator, FVector(PodInnerRadius * 2.f, PodInnerRadius * 2.f, 270), EKind::Translucent, FLinearColor(0.35f, 0.7f, 1.f), 0.6f, 0.10f))
		GlassMid = Cast<UMaterialInstanceDynamic>(G->GetMaterial(0));
	// Overhead collar with emissive ring.
	AddMesh(Cyl, FVector(0, 0, PlatformTopZ + 292.f), FRotator::ZeroRotator, FVector(230, 230, 44), EKind::Lit, Steel);
	AddMesh(Cyl, FVector(0, 0, PlatformTopZ + 268.f), FRotator::ZeroRotator, FVector(204, 204, 4), EKind::Emissive, Cyan, 9.f, 1, false, false, true);
	AddMesh(Cyl, FVector(0, 0, PlatformTopZ + 275.f), FRotator::ZeroRotator, FVector(176, 176, 8), EKind::Lit, Dark);
}

void AMRAvatarV2Chamber::BuildSupports()
{
	// Four pillars with braces and an overhead ring beam.
	for (int32 i = 0; i < 4; ++i)
	{
		const float A = FMath::DegreesToRadians(45.f + 90.f * i);
		const FVector P(FMath::Cos(A) * 175.f, FMath::Sin(A) * 175.f, 180.f);
		AddMesh(Cube, P, FRotator(0, 45.f + 90.f * i, 0), FVector(26, 26, 340), EKind::Lit, Steel);
		AddMesh(Cube, P * FVector(1, 1, 0) + FVector(0, 0, 90), FRotator(0, 45.f + 90.f * i, 0), FVector(30, 30, 6), EKind::Emissive, i % 2 ? Violet : Cyan, 7.f, 1, false, false, true);
		// diagonal brace to the platform edge
		const FVector B = FVector(FMath::Cos(A) * 215.f, FMath::Sin(A) * 215.f, 80.f);
		AddMesh(Cube, B, FRotator(30.f, 45.f + 90.f * i, 0), FVector(14, 14, 150), EKind::Lit, Dark);
	}
	AddMesh(Cube, FVector(0, 0, 340), FRotator::ZeroRotator, FVector(440, 22, 18), EKind::Lit, Steel);
	AddMesh(Cube, FVector(0, 0, 340), FRotator(0, 90, 0), FVector(440, 22, 18), EKind::Lit, Steel);
	for (int32 s = -1; s <= 1; s += 2)   // service conduits to the ceiling
		AddMesh(Cyl, FVector(0, s * 120.f, 480.f), FRotator::ZeroRotator, FVector(20, 20, 280), EKind::Lit, Dark);
}

void AMRAvatarV2Chamber::BuildRoom()
{
	// Floor with a collidable slab; the platform stands on it.
	AddMesh(Cube, FVector(75, 0, -10), FRotator::ZeroRotator, FVector(1550, 1400, 20), EKind::Lit, Panel, 0, 1, true);
	for (int32 i = -3; i <= 3; ++i)   // emissive floor guide strips
		AddMesh(Cube, FVector(75, i * 180.f, 0.5f), FRotator::ZeroRotator, FVector(1500, 3, 1), EKind::Emissive, (i % 2) ? Violet : Cyan, 2.5f);
	AddMesh(Cube, FVector(75, 0, 620), FRotator::ZeroRotator, FVector(1550, 1400, 20), EKind::Lit, Dark);   // ceiling
	for (int32 i = 0; i < 8; ++i) AddMesh(Cube, FVector(-650.f + i * 200.f, 0, 596), FRotator::ZeroRotator, FVector(24, 1400, 28), EKind::Lit, Steel);   // ceiling ribs
	// Side walls, front wall.
	for (int32 s = -1; s <= 1; s += 2)
	{
		AddMesh(Cube, FVector(75, s * 710.f, 300), FRotator::ZeroRotator, FVector(1550, 20, 620), EKind::Lit, Panel);
		for (int32 i = 0; i < 9; ++i) AddMesh(Cube, FVector(-600.f + i * 170.f, s * 698.f, 260), FRotator::ZeroRotator, FVector(10, 4, 360), EKind::Emissive, (i % 2) ? Violet : Cyan, 3.f, 1, false, false, i % 3 == 0);
		AddMesh(Cube, FVector(75, s * 696.f, 90), FRotator::ZeroRotator, FVector(1500, 8, 8), EKind::Emissive, Cyan, 4.f);
	}
	AddMesh(Cube, FVector(860, 0, 300), FRotator::ZeroRotator, FVector(20, 1400, 620), EKind::Lit, Panel);
	for (int32 i = -3; i <= 3; ++i) AddMesh(Cube, FVector(848, i * 170.f, 280), FRotator::ZeroRotator, FVector(4, 10, 320), EKind::Emissive, (i % 2) ? Cyan : Violet, 2.5f);
	// Back wall with a window opening (planet outside).
	AddMesh(Cube, FVector(-660, -355, 310), FRotator::ZeroRotator, FVector(20, 690, 620), EKind::Lit, Panel);
	AddMesh(Cube, FVector(-660, 600, 310), FRotator::ZeroRotator, FVector(20, 200, 620), EKind::Lit, Panel);
	AddMesh(Cube, FVector(-660, 250, 70), FRotator::ZeroRotator, FVector(20, 500, 140), EKind::Lit, Panel);
	AddMesh(Cube, FVector(-660, 250, 505), FRotator::ZeroRotator, FVector(20, 500, 230), EKind::Lit, Panel);
	for (int32 s = -1; s <= 1; s += 2) AddMesh(Cube, FVector(-648, 250, 140 + (s > 0 ? 250.f : 0.f)), FRotator::ZeroRotator, FVector(8, 520, 6), EKind::Emissive, Cyan, 6.f, 1, false, false, true);
	AddMesh(Sph, FVector(-1600, 250, 280), FRotator::ZeroRotator, FVector(1100, 1100, 1100), EKind::Emissive, FLinearColor(0.08f, 0.2f, 0.55f), 1.2f);   // distant planet (dev sphere)
	AddMesh(Sph, FVector(-1600, 250, 280), FRotator::ZeroRotator, FVector(1160, 1160, 1160), EKind::Translucent, FLinearColor(0.2f, 0.5f, 1.f), 0.5f, 0.12f);
	for (int32 i = 0; i < 24; ++i)   // stars
		AddMesh(Sph, FVector(-1800.f, FMath::FRandRange(-300.f, 800.f) , FMath::FRandRange(40.f, 560.f)), FRotator::ZeroRotator, FVector(5, 5, 5), EKind::Emissive, FLinearColor::White, 6.f);
	for (int32 i = 0; i < 6; ++i) AddMesh(Cube, FVector(-648, -620.f + i * 110.f, 290), FRotator::ZeroRotator, FVector(6, 8, 330), EKind::Emissive, (i % 2) ? Violet : Cyan, 3.f);
}

void AMRAvatarV2Chamber::BuildProps()
{
	// Gantry/balcony on the left wall.
	AddMesh(Cube, FVector(-250, -640, 300), FRotator::ZeroRotator, FVector(500, 120, 14), EKind::Lit, Steel);
	AddMesh(Cube, FVector(-250, -584, 345), FRotator::ZeroRotator, FVector(500, 4, 5), EKind::Emissive, Cyan, 5.f);
	for (int32 i = 0; i < 6; ++i) AddMesh(Cube, FVector(-480.f + i * 90.f, -584, 322), FRotator::ZeroRotator, FVector(5, 5, 48), EKind::Lit, Dark);
	AddMesh(Cube, FVector(-500, -640, 150), FRotator::ZeroRotator, FVector(26, 26, 300), EKind::Lit, Steel);
	AddMesh(Cube, FVector(0, -640, 150), FRotator::ZeroRotator, FVector(26, 26, 300), EKind::Lit, Steel);
	// Consoles with tilted holographic screens.
	for (int32 i = 0; i < 4; ++i)
	{
		const FVector P(-420.f + i * 130.f, 420.f, 0.f);
		AddMesh(Cube, P + FVector(0, 0, 45), FRotator::ZeroRotator, FVector(100, 60, 90), EKind::Lit, Steel);
		AddMesh(Pln, P + FVector(-18, 0, 130), FRotator(-70, 180, 0), FVector(90, 50, 1), EKind::Emissive, (i % 2) ? Violet : Cyan, 3.f, 1, false, false, true);
	}
	// Equipment racks and crates along the front corners.
	for (int32 i = 0; i < 5; ++i)
	{
		AddMesh(Cube, FVector(700, -560.f + i * 70.f, 100), FRotator::ZeroRotator, FVector(80, 60, 200), EKind::Lit, Steel);
		AddMesh(Cube, FVector(658, -560.f + i * 70.f, 150), FRotator::ZeroRotator, FVector(4, 8, 50), EKind::Emissive, i % 2 ? Gold : Cyan, 4.f);   // gold used only as a selective accent
	}
	for (int32 i = 0; i < 4; ++i) AddMesh(Cube, FVector(250.f + i * 60.f, 590.f, 35), FRotator(0, 10.f * i, 0), FVector(55, 55, 70), EKind::Lit, Dark);
	// Wall-mounted hazard/status lights near the back.
	AddMesh(Cube, FVector(-648, -250, 100), FRotator::ZeroRotator, FVector(6, 60, 6), EKind::Emissive, Magenta, 5.f, 1, false, false, true);
}

void AMRAvatarV2Chamber::BuildMistAndHolo()
{
	// Low drifting vapor discs (translucent, unlit, no collision, no shadow).
	for (int32 i = 0; i < 5; ++i)
	{
		const float Op = 0.10f + 0.02f * i;
		if (UStaticMeshComponent* M = AddMesh(Sph, FVector(0, 0, PlatformTopZ + 8.f + i * 9.f), FRotator(0, i * 31.f, 0), FVector(230.f - i * 16.f, 190.f + i * 10.f, 26.f + i * 6.f), EKind::Translucent, FLinearColor(0.6f, 0.8f, 1.f), 0.8f, Op))
		{ Mist.Add(M); MistBaseOpacity.Add(Op); }
	}
	// Two thin hologram rings around the pod, rotating slowly (never across the face height).
	for (int32 i = 0; i < 2; ++i)
		if (UStaticMeshComponent* R = AddMesh(Cyl, FVector(0, 0, PlatformTopZ + 60.f + i * 190.f), FRotator::ZeroRotator, FVector(196, 196, 1.2f), EKind::Translucent, i ? Violet : Cyan, 3.f, 0.5f)) Spinners.Add(R);
	Stats.NumAnimated = Spinners.Num() + Mist.Num() + PulseMids.Num();
}

void AMRAvatarV2Chamber::AddLights()
{
	float LightScale = 1.f; FParse::Value(FCommandLine::Get(), TEXT("MRAV2LightScale="), LightScale);   // dev tuning hook
	auto Spot = [&](const FVector& L, const FVector& Aim, float Cd, const FLinearColor& C, bool bShadow, float Cone)
	{
		USpotLightComponent* S = NewObject<USpotLightComponent>(this);
		S->SetMobility(EComponentMobility::Movable); S->SetupAttachment(Root);
		S->SetRelativeLocation(L); S->SetRelativeRotation((Aim - L).Rotation());
		S->SetIntensityUnits(ELightUnits::Candelas); S->SetIntensity(Cd * LightScale); S->SetLightColor(C);
		S->SetAttenuationRadius(1400.f); S->SetOuterConeAngle(Cone); S->SetInnerConeAngle(Cone * 0.5f); S->SetCastShadows(bShadow);
		S->RegisterComponent(); ++Stats.NumLights; if (bShadow) ++Stats.NumShadowCastingLights;
	};
	auto Point = [&](const FVector& L, float Cd, const FLinearColor& C, float Radius)
	{
		UPointLightComponent* P = NewObject<UPointLightComponent>(this);
		P->SetMobility(EComponentMobility::Movable); P->SetupAttachment(Root);
		P->SetRelativeLocation(L); P->SetIntensityUnits(ELightUnits::Candelas); P->SetIntensity(Cd * LightScale); P->SetLightColor(C);
		P->SetAttenuationRadius(Radius); P->SetCastShadows(false);
		P->RegisterComponent(); ++Stats.NumLights;
	};
	const FVector Target(0, 0, PlatformTopZ + 100.f);
	Spot(FVector(380, -170, 330), Target, 2400.f, FLinearColor(0.85f, 0.92f, 1.f), true, 34.f);        // key: cool white, front-high-left
	Spot(FVector(380, 200, 120), Target, 450.f, FLinearColor(0.9f, 0.95f, 1.f), false, 40.f);         // soft fill (front-right, low)
	Spot(FVector(-170, -110, 300), Target, 1500.f, FLinearColor(0.f, 0.7f, 1.f), false, 45.f);         // cyan rim, rear-left
	Spot(FVector(-170, 110, 300), Target, 1500.f, FLinearColor(0.f, 0.7f, 1.f), false, 45.f);          // cyan rim, rear-right
	Point(FVector(0, 190, PlatformTopZ + 40.f), 600.f, FLinearColor(0.55f, 0.12f, 1.f), 450.f);       // violet kicker, low side
	Point(FVector(0, -190, PlatformTopZ + 40.f), 600.f, FLinearColor(1.f, 0.12f, 0.6f), 450.f);       // magenta kicker, low opposite side
	Point(FVector(-560, -250, 110), 150.f, Gold, 260.f);                                               // selective gold accent near the back wall only
	Point(FVector(-300, 0, 520), 300.f, FLinearColor(0.1f, 0.4f, 0.7f), 900.f);                        // dim station ambient
}

void AMRAvatarV2Chamber::PlaceCharacter(ACharacter* C) const
{
	if (!C) return;
	const float HalfHeight = C->GetCapsuleComponent() ? C->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() : 90.f;
	C->SetActorLocationAndRotation(GetCharacterFeet() + FVector(0, 0, HalfHeight + 0.5f), FRotator(0.f, GetCharacterFacingYaw(), 0.f), false, nullptr, ETeleportType::TeleportPhysics);
	if (UCharacterMovementComponent* M = C->GetCharacterMovement()) { M->StopMovementImmediately(); M->DisableMovement(); }
}

void AMRAvatarV2Chamber::SetGlassOpacityForCameraDistance(float D)
{
	if (!GlassMid) return;
	const float T = FMath::Clamp((D - 90.f) / (250.f - 90.f), 0.f, 1.f);
	GlassMid->SetScalarParameterValue(TEXT("Opacity"), FMath::Lerp(0.02f, 0.10f, T));   // design: glass fades to ~15% of its strength inside ~1.2 m
}

void AMRAvatarV2Chamber::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!bBuilt) return;
	Clock += Dt;
	for (int32 i = 0; i < PulseMids.Num(); ++i)
		if (PulseMids[i]) PulseMids[i]->SetScalarParameterValue(TEXT("Emissive"), PulseBase[i] * (0.8f + 0.2f * FMath::Sin(Clock * 2.2f + i * 0.9f)));
	for (int32 i = 0; i < Spinners.Num(); ++i) if (Spinners[i]) Spinners[i]->AddRelativeRotation(FRotator(0, (i ? -6.f : 8.f) * Dt, 0));
	for (int32 i = 0; i < Mist.Num(); ++i)
	{
		if (!Mist[i]) continue;
		Mist[i]->AddRelativeRotation(FRotator(0, (3.f + i) * Dt, 0));
		if (UMaterialInstanceDynamic* M = Cast<UMaterialInstanceDynamic>(Mist[i]->GetMaterial(0))) M->SetScalarParameterValue(TEXT("Opacity"), MistBaseOpacity[i] * (0.75f + 0.25f * FMath::Sin(Clock * 0.6f + i)));
	}
}
