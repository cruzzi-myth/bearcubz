// Moon Racer - Avatar Creator V2 DEVELOPMENT interface shell (AV2 I1+I2). UMG tree built in C++ from the shared MRUi tokens.
// Left rail: the 14 numbered categories. Bottom: the six-stage track, camera view buttons, back/next. Right: the selected category only.
// Only controls backed by a real implementation are interactive; everything else is explained in text, never drawn as a fake control.

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "AvatarV2/MRUi.h"
#include "MRAvatarV2Widget.generated.h"

class UMRAvatarV2Session;
class UTextBlock;
class UVerticalBox;
class UHorizontalBox;
class UScrollBox;

UCLASS()
class MOONRACER_API UMRAvatarV2Widget : public UUserWidget
{
	GENERATED_BODY()

public:

	static constexpr float LeftPanelWidth = 300.f, RightPanelWidth = 380.f, TopBarHeight = 56.f, BottomBarHeight = 150.f, Margin = 16.f;

	/** Camera callbacks, supplied by the controller. The widget never touches the camera or the character itself. */
	TFunction<void(FName /*Action*/, FName /*Param*/)> CameraAction;   // "view"(name), "reset_camera", "zoom"(in/out)
	TFunction<void(float, float)> OnOrbit;                            // (deltaYawDeg, deltaPitchDeg) from a mouse drag
	TFunction<void(float)> OnWheelZoom;                               // wheel delta

	void Bind(UMRAvatarV2Session* InSession);

	UFUNCTION() void HandleAction(FName Action, FName Param);

	int32 GetStage() const { return Stage; }
	int32 GetCategory() const { return Category; }
	const FString& GetStatus() const { return StatusLine; }
	bool HasButton(FName Action, FName Param) const;
	bool IsButtonEnabled(FName Action, FName Param) const;
	FString GetButtonLabel(FName Action, FName Param) const;
	int32 NumButtons() const { return Buttons.Num(); }
	/** Text currently shown in the right panel (for tests). */
	FString GetPanelText() const { return PanelText; }
	/** True when a local point belongs to the 3D viewport (drag-to-orbit) rather than to a panel. */
	static bool IsInViewportRegion(const FVector2D& Local, const FVector2D& Size);

protected:

	virtual bool Initialize() override;
	virtual FReply NativeOnMouseButtonDown(const FGeometry& InGeometry, const FPointerEvent& InMouseEvent) override;
	virtual FReply NativeOnMouseButtonUp(const FGeometry& InGeometry, const FPointerEvent& InMouseEvent) override;
	virtual FReply NativeOnMouseMove(const FGeometry& InGeometry, const FPointerEvent& InMouseEvent) override;
	virtual FReply NativeOnMouseWheel(const FGeometry& InGeometry, const FPointerEvent& InMouseEvent) override;

private:

	void BuildStatic();
	void RebuildPanel();
	void Refresh();
	void SetStatus(const FString& S);
	void SelectStage(int32 N);
	void SelectCategory(int32 N);
	UMRUiButton* AddButton(UVerticalBox* Parent, const FString& Label, FName Action, FName Param, EMRUiButtonVariant V, bool bEnabled = true, bool bStatic = false);
	void AddLine(UVerticalBox* Parent, const FString& S, FMRUi::ETextRole Role);
	void AddOptionList(UVerticalBox* Parent, int32 KindAsInt, FName Action);
	void AddUnavailable(UVerticalBox* Parent, int32 CategoryNumber);
	void AddReview(UVerticalBox* Parent);
	FString Key(FName A, FName P) const { return A.ToString() + TEXT(":") + P.ToString(); }
	void RegisterButton(UMRUiButton* B, bool bStatic);

	UPROPERTY(Transient) TObjectPtr<UMRAvatarV2Session> Session;
	UPROPERTY(Transient) TObjectPtr<UVerticalBox> PanelBox;
	UPROPERTY(Transient) TObjectPtr<UVerticalBox> RailBox;
	UPROPERTY(Transient) TObjectPtr<UHorizontalBox> BottomRow;
	UPROPERTY(Transient) TObjectPtr<UTextBlock> StatusText;
	UPROPERTY(Transient) TMap<FString, TObjectPtr<UMRUiButton>> Buttons;
	TArray<FString> StaticKeys, DynamicKeys;
	int32 Stage = 1, Category = 1;
	FString StatusLine, PanelText;
	bool bDragging = false;
};
