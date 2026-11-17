// Moon Racer - Avatar Creator V2 DEVELOPMENT gate (AV2 I1+I2).
// The experimental V2 creator is reachable only with the explicit flag -MRAvatarV2Dev, is refused in Shipping builds
// (compile-time) and refuses the default player avatar slot. The V1 creator remains the default.

#pragma once

#include "CoreMinimal.h"

namespace MRAvatarV2Dev
{
	inline constexpr const TCHAR* FlagName = TEXT("MRAvatarV2Dev");
	/** Slot used when no -MRAvatarSlot is given. Never the player's default slot. */
	inline constexpr const TCHAR* DefaultDevSlot = TEXT("MRAvatarV2_Dev");
	/** The V1/production default avatar slot name (see UMRAvatarSaveSubsystem::GetSlotName). */
	inline constexpr const TCHAR* ProtectedDefaultSlot = TEXT("MRAvatar_Local");

	MOONRACER_API bool IsFlagPresent();
	MOONRACER_API bool IsShippingBuild();
	/** Flag present AND not a Shipping build. */
	MOONRACER_API bool IsAllowed();
	MOONRACER_API bool IsProtectedSlot(const FString& Slot);
	/** -MRAvatarSlot=<x> if given, else DefaultDevSlot. */
	MOONRACER_API FString ResolveSlotName();
	/** Empty when the V2 creator may run, else the reason it is refused. */
	MOONRACER_API FString RefusalReason();

	MOONRACER_API void SetFlagOverrideForTest(TOptional<bool> Forced);
	MOONRACER_API void SetSimulateShippingForTest(bool bSimulate);
}
