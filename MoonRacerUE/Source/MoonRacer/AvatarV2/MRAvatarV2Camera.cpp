#include "AvatarV2/MRAvatarV2Camera.h"

namespace
{
	// View presets are starting values for the greybox (see AV2-D8 specification section 4). Vertical FOV, centimetres, degrees.
	const FMRV2ViewPreset GPresets[] = {
		{ EMRV2View::FullBody,  TEXT("Full body"),  92.f, 400.f, 320.f, 520.f,  4.f, -10.f, 25.f,   0.f, 180.f, 40.f },
		{ EMRV2View::Face,      TEXT("Face"),      166.f,  85.f,  60.f, 130.f,  0.f, -15.f, 15.f,   0.f,  60.f, 28.f },
		{ EMRV2View::UpperBody, TEXT("Upper body"),135.f, 175.f, 120.f, 240.f,  2.f, -10.f, 15.f,   0.f,  90.f, 32.f },
		{ EMRV2View::Front,     TEXT("Front"),      92.f, 400.f, 320.f, 520.f,  4.f, -10.f, 25.f,   0.f,  20.f, 40.f },
		{ EMRV2View::Side,      TEXT("Side"),       92.f, 400.f, 320.f, 520.f,  4.f, -10.f, 25.f,  90.f,  20.f, 40.f },
		{ EMRV2View::Rear,      TEXT("Rear"),       92.f, 400.f, 320.f, 520.f,  4.f, -10.f, 25.f, 180.f,  20.f, 40.f },
	};
}

const FMRV2ViewPreset& FMRAvatarV2CameraModel::Preset(EMRV2View V) { return GPresets[(int32)V]; }

const TArray<EMRV2View>& FMRAvatarV2CameraModel::AllViews()
{
	static const TArray<EMRV2View> All = { EMRV2View::FullBody, EMRV2View::Face, EMRV2View::UpperBody, EMRV2View::Front, EMRV2View::Side, EMRV2View::Rear };
	return All;
}

void FMRAvatarV2CameraModel::SetView(EMRV2View NewView, bool bInstant)
{
	View = NewView;
	ResetCamera(bInstant);
}

void FMRAvatarV2CameraModel::ResetCamera(bool bInstant)
{
	const FMRV2ViewPreset& P = Preset(View);
	TargetYaw = P.Yaw; TargetPitch = P.Pitch; TargetDistance = P.Distance; TargetFov = P.VerticalFov; TargetFocusHeight = P.FocusHeight;
	if (bInstant || bReduceMotion) { Yaw = TargetYaw; Pitch = TargetPitch; Distance = TargetDistance; Fov = TargetFov; FocusHeight = TargetFocusHeight; }
}

void FMRAvatarV2CameraModel::Orbit(float DeltaYaw, float DeltaPitch)
{
	const FMRV2ViewPreset& P = Preset(View);
	TargetYaw += DeltaYaw;
	if (P.YawRange >= 180.f) TargetYaw = FMath::UnwindDegrees(TargetYaw);
	else TargetYaw = P.Yaw + FMath::Clamp(FMath::FindDeltaAngleDegrees(P.Yaw, TargetYaw), -P.YawRange, P.YawRange);
	TargetPitch = FMath::Clamp(TargetPitch + DeltaPitch, P.MinPitch, P.MaxPitch);
	if (bReduceMotion) { Yaw = TargetYaw; Pitch = TargetPitch; }
}

void FMRAvatarV2CameraModel::Zoom(float DeltaCm)
{
	const FMRV2ViewPreset& P = Preset(View);
	TargetDistance = FMath::Clamp(TargetDistance + DeltaCm, P.MinDistance, P.MaxDistance);
	if (bReduceMotion) Distance = TargetDistance;
}

void FMRAvatarV2CameraModel::Tick(float Dt)
{
	const float A = 1.f - FMath::Exp(-FMath::Max(Dt, 0.f) * 10.f);   // ~0.35-0.5 s settle (design: ease, no overshoot)
	Yaw = FMath::UnwindDegrees(Yaw + FMath::FindDeltaAngleDegrees(Yaw, TargetYaw) * A);
	Pitch = FMath::Lerp(Pitch, TargetPitch, A);
	Distance = FMath::Lerp(Distance, TargetDistance, A);
	Fov = FMath::Lerp(Fov, TargetFov, A);
	FocusHeight = FMath::Lerp(FocusHeight, TargetFocusHeight, A);
}

FVector FMRAvatarV2CameraModel::GetFocus() const { return Feet + FVector(0.f, 0.f, FocusHeight); }

FVector FMRAvatarV2CameraModel::GetLocation() const
{
	const float Y = FMath::DegreesToRadians(Yaw + FacingYaw), P = FMath::DegreesToRadians(Pitch);
	return GetFocus() + Distance * FVector(FMath::Cos(P) * FMath::Cos(Y), FMath::Cos(P) * FMath::Sin(Y), FMath::Sin(P));
}

FRotator FMRAvatarV2CameraModel::GetRotation() const { return (GetFocus() - GetLocation()).Rotation(); }

float FMRAvatarV2CameraModel::GetHorizontalFov(float Aspect) const
{
	return FMath::RadiansToDegrees(2.f * FMath::Atan(FMath::Tan(FMath::DegreesToRadians(Fov) * 0.5f) * FMath::Max(Aspect, 0.1f)));
}

float FMRAvatarV2CameraModel::ApproxCharacterScreenFraction(float CharacterHeightCm) const
{
	const float Visible = 2.f * Distance * FMath::Tan(FMath::DegreesToRadians(Fov) * 0.5f);
	return Visible > KINDA_SMALL_NUMBER ? CharacterHeightCm / Visible : 0.f;
}
