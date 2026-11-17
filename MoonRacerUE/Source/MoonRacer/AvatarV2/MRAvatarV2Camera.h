// Moon Racer - Avatar Creator V2 camera model (AV2 I2). Pure logic, no world dependency: an orbit camera around a focus
// point on the character, with named views, per-view limits and smoothing. It never touches the character or its appearance.

#pragma once

#include "CoreMinimal.h"

enum class EMRV2View : uint8 { FullBody, Face, UpperBody, Front, Side, Rear };

struct MOONRACER_API FMRV2ViewPreset
{
	EMRV2View View;
	const TCHAR* Name;
	float FocusHeight;   // cm above the character's feet
	float Distance;      // cm, default
	float MinDistance, MaxDistance;
	float Pitch;         // degrees of elevation, default
	float MinPitch, MaxPitch;
	float Yaw;           // degrees from the character's facing (0 = front), default
	float YawRange;      // free orbit +/- around Yaw; >= 180 means unrestricted
	float VerticalFov;   // degrees
};

struct MOONRACER_API FMRAvatarV2CameraModel
{
	static const FMRV2ViewPreset& Preset(EMRV2View View);
	static const TArray<EMRV2View>& AllViews();

	/** Character feet position and facing yaw (degrees). Camera angles are relative to this facing. */
	void SetAnchor(const FVector& InFeet, float InFacingYaw) { Feet = InFeet; FacingYaw = InFacingYaw; }

	void SetView(EMRV2View NewView, bool bInstant = false);
	/** Restore the current view's default framing. */
	void ResetCamera(bool bInstant = false);
	void Orbit(float DeltaYaw, float DeltaPitch);
	void Zoom(float DeltaCm);
	void Tick(float DeltaSeconds);

	EMRV2View GetView() const { return View; }
	FVector GetFocus() const;
	FVector GetLocation() const;
	FRotator GetRotation() const;
	float GetVerticalFov() const { return Fov; }
	float GetDistance() const { return Distance; }
	float GetYaw() const { return Yaw; }
	float GetPitch() const { return Pitch; }
	float GetTargetDistance() const { return TargetDistance; }
	float GetTargetYaw() const { return TargetYaw; }
	float GetTargetPitch() const { return TargetPitch; }
	/** UE cameras use a horizontal FOV; convert from the preset's vertical FOV for an aspect ratio (width/height). */
	float GetHorizontalFov(float AspectRatio) const;
	/** Fraction of the view height covered by a character of this height centred on the feet-to-head span, at the current framing. */
	float ApproxCharacterScreenFraction(float CharacterHeightCm) const;

	bool bReduceMotion = false;

private:
	EMRV2View View = EMRV2View::FullBody;
	FVector Feet = FVector::ZeroVector;
	float FacingYaw = 0.f;
	float Yaw = 0.f, Pitch = 4.f, Distance = 400.f, Fov = 40.f, FocusHeight = 92.f;
	float TargetYaw = 0.f, TargetPitch = 4.f, TargetDistance = 400.f, TargetFov = 40.f, TargetFocusHeight = 92.f;
};
