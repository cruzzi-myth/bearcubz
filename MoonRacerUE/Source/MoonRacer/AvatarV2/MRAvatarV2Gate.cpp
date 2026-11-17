#include "AvatarV2/MRAvatarV2Gate.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

namespace
{
	TOptional<bool> GAvatarV2FlagOverride;
	bool GAvatarV2SimulateShipping = false;
}

namespace MRAvatarV2Dev
{
	bool IsFlagPresent()
	{
		if (GAvatarV2FlagOverride.IsSet()) return GAvatarV2FlagOverride.GetValue();
		return FParse::Param(FCommandLine::Get(), FlagName);
	}

	bool IsShippingBuild()
	{
#if UE_BUILD_SHIPPING
		return true;
#else
		return GAvatarV2SimulateShipping;
#endif
	}

	bool IsAllowed() { return !IsShippingBuild() && IsFlagPresent(); }

	bool IsProtectedSlot(const FString& Slot) { return Slot.IsEmpty() || Slot.Equals(ProtectedDefaultSlot, ESearchCase::IgnoreCase); }

	FString ResolveSlotName()
	{
		FString S;
		if (FParse::Value(FCommandLine::Get(), TEXT("MRAvatarSlot="), S) && !S.IsEmpty()) return S;
		return DefaultDevSlot;
	}

	FString RefusalReason()
	{
		if (IsShippingBuild()) return TEXT("Avatar Creator V2 is a development prototype and is not available in Shipping builds.");
		if (!IsFlagPresent()) return FString::Printf(TEXT("Avatar Creator V2 needs the explicit development flag -%s."), FlagName);
		if (IsProtectedSlot(ResolveSlotName())) return TEXT("Avatar Creator V2 refuses the default player avatar slot; use a dedicated -MRAvatarSlot=<name>.");
		return FString();
	}

	void SetFlagOverrideForTest(TOptional<bool> Forced) { GAvatarV2FlagOverride = Forced; }
	void SetSimulateShippingForTest(bool bSimulate) { GAvatarV2SimulateShipping = bSimulate; }
}
