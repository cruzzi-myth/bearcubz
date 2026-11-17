// Moon Racer - reusable UI design tokens and components (AV2 I1).
// Tokens follow the AV2-D8 shared-UI proposal: dark translucent panels, cyan primary, violet secondary, selective gold.
// IMPORTANT: the colour values below are PROPOSED development values, NOT measured from the reference images
// (they are marked "pending verification" in the specification). Font families are the engine defaults for the same reason.

#pragma once

#include "CoreMinimal.h"
#include "Components/Button.h"
#include "MRUi.generated.h"

class UBorder;
class UTextBlock;
class UWidgetTree;

namespace MRUi
{
	struct FTokens
	{
		FLinearColor BgScreenDim   {0.f, 0.f, 0.f, 0.0f};
		FLinearColor BgPanel       {0.015f, 0.02f, 0.04f, 0.78f};
		FLinearColor BgBar         {0.01f, 0.013f, 0.03f, 0.88f};
		FLinearColor StrokeCyan    {0.f, 0.62f, 0.85f, 1.f};
		FLinearColor StrokeViolet  {0.45f, 0.18f, 0.9f, 1.f};
		FLinearColor AccentGold    {0.95f, 0.68f, 0.2f, 1.f};
		FLinearColor TextPrimary   {0.92f, 0.96f, 1.f, 1.f};
		FLinearColor TextMuted     {0.55f, 0.62f, 0.72f, 1.f};
		FLinearColor StateOk       {0.25f, 0.85f, 0.55f, 1.f};
		FLinearColor StateWarn     {0.95f, 0.75f, 0.25f, 1.f};
		FLinearColor StateError    {0.95f, 0.35f, 0.4f, 1.f};
		FLinearColor ButtonFill    {0.03f, 0.05f, 0.09f, 0.9f};
		FLinearColor ButtonHover   {0.05f, 0.14f, 0.2f, 0.95f};
		FLinearColor ButtonPressed {0.08f, 0.22f, 0.3f, 1.f};
		FLinearColor ButtonSelected{0.18f, 0.08f, 0.4f, 0.95f};
		FLinearColor ButtonPrimary {0.f, 0.3f, 0.42f, 0.95f};
		FLinearColor ButtonDisabled{0.02f, 0.025f, 0.04f, 0.6f};
		float CornerRadius = 5.f;
		float StrokeWidth = 1.5f;
		int32 FontTitle = 22, FontH1 = 18, FontH2 = 14, FontBody = 12, FontCaption = 10;
		FMargin PanelPadding {12.f};
	};
	MOONRACER_API const FTokens& Tokens();
}

UENUM()
enum class EMRUiButtonVariant : uint8 { Default, Selected, Primary, Subtle };

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FMRUiAction, FName, Action, FName, Param);

/** Reusable button: an (Action, Param) pair, variant styling, and enabled/disabled look from the token set. */
UCLASS()
class MOONRACER_API UMRUiButton : public UButton
{
	GENERATED_BODY()

public:
	UPROPERTY() FName ActionName;
	UPROPERTY() FName ParamName;
	UPROPERTY() FMRUiAction OnAction;
	UPROPERTY(Transient) TObjectPtr<UTextBlock> Label;
	EMRUiButtonVariant Variant = EMRUiButtonVariant::Default;

	void InitAction(FName InAction, FName InParam);
	void SetVariant(EMRUiButtonVariant V);

private:
	UFUNCTION() void HandleClicked();
};

/** Factory helpers that build token-styled widgets in a widget tree. */
struct MOONRACER_API FMRUi
{
	enum class ETextRole : uint8 { Title, H1, H2, Body, Caption, Muted, Ok, Warn, Error, Gold };
	static UTextBlock* Text(UWidgetTree* Tree, const FString& S, ETextRole Role, float WrapAt = 0.f);
	static UBorder* Panel(UWidgetTree* Tree, const FLinearColor& Fill, const FLinearColor& Outline);
	static UMRUiButton* Button(UWidgetTree* Tree, const FString& Label, FName Action, FName Param, EMRUiButtonVariant Variant = EMRUiButtonVariant::Default, float WrapAt = 0.f);
	static UBorder* Separator(UWidgetTree* Tree);
};
