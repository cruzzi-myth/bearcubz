// Moon Racer - DEVELOPMENT Avatar Creator (UMG), Phase 3A.5.
// The widget tree is built in C++. It lists only options that exist (Status != Pending), labels the Epic Manny/Quinn
// stand-ins as development placeholders, and labels species with no 3D model as pending. It never invents appearances.

#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/Button.h"
#include "GameFramework/PlayerController.h"
#include "Avatar/MRAvatarTypes.h"
#include "MRAvatarCreatorWidget.generated.h"

class AMRPlayerCharacter;
class UMRAvatarCustomizationComponent;
class UMRAvatarCatalog;
class UTextBlock;
class UVerticalBox;
class UScrollBox;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FMRCreatorAction, FName, Action, FName, Param);

/** A UMG button that reports an (Action, Param) pair, so one handler serves every button. */
UCLASS()
class MOONRACER_API UMRCreatorButton : public UButton
{
	GENERATED_BODY()

public:
	UPROPERTY() FName ActionName;
	UPROPERTY() FName ParamName;
	UPROPERTY() FMRCreatorAction OnAction;

	void InitAction(FName InAction, FName InParam);

private:
	UFUNCTION() void HandleClicked();
};

UCLASS()
class MOONRACER_API UMRAvatarCreatorWidget : public UUserWidget
{
	GENERATED_BODY()

public:

	/** Bind to the pawn being edited and (re)build the option lists from the catalog. */
	void SetTarget(AMRPlayerCharacter* InTarget);

	/** Every button routes here. Also callable directly (automated tests drive the creator through this). */
	UFUNCTION()
	void HandleAction(FName Action, FName Param);

	const FMRAvatarAppearance& GetWorking() const { return Working; }
	const FString& GetStatus() const { return Status; }
	/** Names of the actions the UI exposes, for tests. */
	bool HasButton(FName Action, FName Param) const;
	int32 NumOptionButtons() const { return ButtonKeys.Num(); }

	// --- test hooks (automated mouse acceptance test): where a button is on screen and what it currently says ---
	/** Centre of a button in Slate absolute (desktop) coordinates. False if the button does not exist or is not laid out. */
	bool GetButtonCenter(FName Action, FName Param, FVector2D& OutAbsolute) const;
	FString GetButtonLabel(FName Action, FName Param) const;
	FString GetButtonDebug(FName Action, FName Param) const;
	/** The scrolling list's visible rectangle in Slate absolute coordinates. */
	bool GetScrollViewport(FVector2D& OutMin, FVector2D& OutMax) const;

protected:
	virtual bool Initialize() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void Rebuild();
	/** Pull the working appearance from the component's real state (the pawn applies its avatar after possession). */
	void SyncWorking();
	void Refresh();
	void SetStatus(const FString& S);
	void TryPreview(const FMRAvatarAppearance& Candidate);
	void Confirm();
	UMRCreatorButton* AddButton(UVerticalBox* Parent, const FString& Label, FName Action, FName Param);
	UTextBlock* AddText(UVerticalBox* Parent, const FString& Text, const FLinearColor& Color, int32 Size);
	bool IsSelected(FName Action, FName Param) const;
	FString KeyOf(FName Action, FName Param) const { return Action.ToString() + TEXT(":") + Param.ToString(); }

	UPROPERTY(Transient) TObjectPtr<AMRPlayerCharacter> Target;
	UPROPERTY(Transient) TObjectPtr<UVerticalBox> Content;
	UPROPERTY(Transient) TObjectPtr<UScrollBox> ScrollBox;
	UPROPERTY(Transient) TMap<FString, TObjectPtr<UMRCreatorButton>> Buttons;
	UPROPERTY(Transient) TObjectPtr<UTextBlock> StatusText;
	UPROPERTY(Transient) TMap<FString, TObjectPtr<UTextBlock>> ButtonTexts;

	TMap<FString, FString> BaseLabels;
	TArray<FString> ButtonKeys;
	FMRAvatarAppearance Working;
	FString Status;
};

/** Player controller for the creator map: shows the creator widget for the possessed AMRPlayerCharacter and a front-facing camera. */
UCLASS()
class MOONRACER_API AMRAvatarCreatorController : public APlayerController
{
	GENERATED_BODY()

public:
	UMRAvatarCreatorWidget* GetCreatorWidget() const { return Widget; }

protected:
	virtual void OnPossess(APawn* InPawn) override;
	/** The engine resets the control rotation to the pawn's on restart, so the front-facing view is applied here. */
	virtual void ClientRestart_Implementation(APawn* NewPawn) override;
	virtual void PlayerTick(float DeltaTime) override;

private:
	UPROPERTY(Transient) TObjectPtr<UMRAvatarCreatorWidget> Widget;
	int32 FrontViewFrames = 0;
};
