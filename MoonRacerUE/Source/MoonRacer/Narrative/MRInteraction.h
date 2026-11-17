// Moon Racer - reusable NPC interaction foundation (Phase 3B P5A).
//   UMRInteractableComponent : put on any actor that can be talked to (identity = an NPC id from the registry; range; availability).
//   UMRInteractorComponent   : put on the player pawn; finds the nearest available interactable in range, shows the prompt, handles
//                              the interact key and starts the NPC's dialogue.
//   AMRDevNpcActor           : DEVELOPMENT-ONLY primitive stand-in carrying an interactable. TEST FIXTURE - NONCANON; no placement is canon.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameFramework/Actor.h"
#include "InputCoreTypes.h"
#include "MRInteraction.generated.h"

class UMRNarrativeSubsystem;
class UMRNarrativeHudWidget;
class UTextRenderComponent;
class UStaticMeshComponent;

DECLARE_MULTICAST_DELEGATE_OneParam(FMROnInteractionStarted, AActor* /*Interactor*/);

UCLASS(ClassGroup=(MoonRacer), meta=(BlueprintSpawnableComponent))
class MOONRACER_API UMRInteractableComponent : public UActorComponent
{
	GENERATED_BODY()
public:
	/** The NPC record this actor represents. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Interaction") FName NpcId;
	/** Max horizontal distance (cm) from the interactor to this actor. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Interaction") float InteractionRange = 250.f;
	/** Max vertical difference (cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Interaction") float MaxHeightDelta = 200.f;
	/** Dev switch: simulate "NPC unavailable" independent of the registry. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Interaction") bool bForceUnavailable = false;

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

	/** All live interactables (weak). */
	static const TArray<TWeakObjectPtr<UMRInteractableComponent>>& All();

	UMRNarrativeSubsystem* Narrative() const;
	bool IsAvailable(FString* Why = nullptr) const;
	bool IsInRange(const AActor* Interactor) const;
	bool CanInteract(const AActor* Interactor, FString* Why = nullptr) const;
	/** Start this NPC's dialogue. Fails (with a reason) when out of range, unavailable, or a conversation is already running. */
	bool TryInteract(AActor* Interactor, FString* Why = nullptr);
	FText GetPromptText() const;

	FMROnInteractionStarted OnInteractionStarted;
	int32 NumInteractions = 0;
};

UCLASS(ClassGroup=(MoonRacer), meta=(BlueprintSpawnableComponent))
class MOONRACER_API UMRInteractorComponent : public UActorComponent
{
	GENERATED_BODY()
public:
	UMRInteractorComponent();
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Interaction") FKey InteractKey = EKeys::E;
	/** Create the narrative HUD (prompt, objective tracker, dialogue panel) for the local player. Off for headless logic tests. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="MR|Interaction") bool bCreateHud = true;

	virtual void TickComponent(float DeltaTime, ELevelTick Tick, FActorComponentTickFunction* Fn) override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

	/** Re-evaluate the focused interactable now (also runs every tick). */
	void RefreshFocus();
	UMRInteractableComponent* GetFocused() const { return Focused.Get(); }
	/** The interact action (bound to InteractKey; callable directly). Returns true if a conversation started. */
	bool Interact();
	bool IsKeyBound() const { return bKeyBound; }
	UMRNarrativeHudWidget* GetHud() const { return Hud; }
	FString LastRefusal;

	DECLARE_MULTICAST_DELEGATE_OneParam(FMROnFocusChanged, UMRInteractableComponent*);
	FMROnFocusChanged OnFocusChanged;

private:
	void TryBindInput();
	void HandleInteractKey() { Interact(); }
	void EnsureHud();
	TWeakObjectPtr<UMRInteractableComponent> Focused;
	UPROPERTY(Transient) TObjectPtr<UMRNarrativeHudWidget> Hud;
	bool bKeyBound = false;
};

UCLASS()
class MOONRACER_API AMRDevNpcActor : public AActor
{
	GENERATED_BODY()
public:
	AMRDevNpcActor();
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Body;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UTextRenderComponent> Label;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UMRInteractableComponent> Interactable;
	/** Convenience: set the NPC id the interactable represents. */
	UPROPERTY(EditAnywhere, Category="MR|Interaction") FName NpcId;
	virtual void BeginPlay() override;
};
