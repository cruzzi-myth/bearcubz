#include "Narrative/MRInteraction.h"
#include "Narrative/MRNarrativeHud.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "Components/InputComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/GameInstance.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "UObject/ConstructorHelpers.h"
#include "MoonRacer.h"

namespace { TArray<TWeakObjectPtr<UMRInteractableComponent>> GInteractables; }

// ---- interactable -----------------------------------------------------------------------------------------------
void UMRInteractableComponent::BeginPlay() { Super::BeginPlay(); GInteractables.AddUnique(this); }
void UMRInteractableComponent::EndPlay(const EEndPlayReason::Type R) { GInteractables.Remove(this); Super::EndPlay(R); }
const TArray<TWeakObjectPtr<UMRInteractableComponent>>& UMRInteractableComponent::All() { return GInteractables; }

UMRNarrativeSubsystem* UMRInteractableComponent::Narrative() const
{
	UWorld* W = GetWorld(); UGameInstance* GI = W ? W->GetGameInstance() : nullptr;
	return GI ? GI->GetSubsystem<UMRNarrativeSubsystem>() : nullptr;
}

bool UMRInteractableComponent::IsAvailable(FString* Why) const
{
	auto No = [&](const TCHAR* W) { if (Why) *Why = W; return false; };
	if (bForceUnavailable) return No(TEXT("forced unavailable"));
	UMRNarrativeSubsystem* N = Narrative();
	if (!N) return No(TEXT("no narrative subsystem"));
	if (!N->IsNpcAvailable(NpcId)) return No(TEXT("NPC not available (unknown id or availability fact not set)"));
	return true;
}

bool UMRInteractableComponent::IsInRange(const AActor* Interactor) const
{
	if (!Interactor || !GetOwner()) return false;
	const FVector D = Interactor->GetActorLocation() - GetOwner()->GetActorLocation();
	return D.Size2D() <= InteractionRange && FMath::Abs(D.Z) <= MaxHeightDelta;
}

bool UMRInteractableComponent::CanInteract(const AActor* Interactor, FString* Why) const
{
	if (!IsInRange(Interactor)) { if (Why) *Why = TEXT("out of range"); return false; }
	if (!IsAvailable(Why)) return false;
	UMRNarrativeSubsystem* N = Narrative();
	if (N && N->GetRuntime() && N->GetRuntime()->IsActive()) { if (Why) *Why = TEXT("a conversation is already active"); return false; }
	return true;
}

bool UMRInteractableComponent::TryInteract(AActor* Interactor, FString* Why)
{
	if (!CanInteract(Interactor, Why)) return false;
	if (!Narrative()->StartConversation(NpcId, Why)) return false;
	++NumInteractions;
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|INTERACT|%s started by %s"), *NpcId.ToString(), Interactor ? *Interactor->GetName() : TEXT("?"));
	OnInteractionStarted.Broadcast(Interactor);
	return true;
}

FText UMRInteractableComponent::GetPromptText() const
{
	const UMRNarrativeSubsystem* N = Narrative();
	const UMRNpcRecord* Npc = N ? N->FindNpc(NpcId) : nullptr;
	const FText Name = Npc ? MRNarrative::ResolveText(Npc->StringTableId, Npc->DisplayNameKey) : FText::FromName(NpcId);
	return FText::Format(FTextFormat::FromString(TEXT("{0} - {1}")), MRNarrative::UiText(TEXT("interact")), Name);
}

// ---- interactor -------------------------------------------------------------------------------------------------
UMRInteractorComponent::UMRInteractorComponent() { PrimaryComponentTick.bCanEverTick = true; }

void UMRInteractorComponent::TryBindInput()
{
	if (bKeyBound) return;
	APawn* P = Cast<APawn>(GetOwner()); APlayerController* PC = P ? Cast<APlayerController>(P->GetController()) : nullptr;
	if (!PC || !PC->IsLocalController() || !PC->InputComponent) return;
	PC->InputComponent->BindKey(InteractKey, IE_Pressed, this, &UMRInteractorComponent::HandleInteractKey);
	bKeyBound = true;
}

void UMRInteractorComponent::EnsureHud()
{
	if (Hud || !bCreateHud) return;
	APawn* P = Cast<APawn>(GetOwner()); APlayerController* PC = P ? Cast<APlayerController>(P->GetController()) : nullptr;
	if (!PC || !PC->IsLocalController()) return;
	Hud = CreateWidget<UMRNarrativeHudWidget>(PC, UMRNarrativeHudWidget::StaticClass());
	if (Hud) { Hud->AddToViewport(20); Hud->BindInteractor(this); }
}

void UMRInteractorComponent::TickComponent(float Dt, ELevelTick T, FActorComponentTickFunction* F)
{
	Super::TickComponent(Dt, T, F);
	TryBindInput(); EnsureHud();
	RefreshFocus();
}

void UMRInteractorComponent::EndPlay(const EEndPlayReason::Type R)
{
	if (Hud) { Hud->RemoveFromParent(); Hud = nullptr; }
	Super::EndPlay(R);
}

void UMRInteractorComponent::RefreshFocus()
{
	UMRInteractableComponent* Best = nullptr; float BestD = TNumericLimits<float>::Max();
	if (AActor* Me = GetOwner())
		for (const TWeakObjectPtr<UMRInteractableComponent>& W : UMRInteractableComponent::All())
		{
			UMRInteractableComponent* C = W.Get();
			if (!C || C->GetWorld() != GetWorld() || !C->CanInteract(Me)) continue;
			const float D = FVector::Dist2D(Me->GetActorLocation(), C->GetOwner()->GetActorLocation());
			if (D < BestD) { BestD = D; Best = C; }
		}
	if (Best != Focused.Get()) { Focused = Best; OnFocusChanged.Broadcast(Best); }
}

bool UMRInteractorComponent::Interact()
{
	LastRefusal.Empty();
	RefreshFocus();
	if (!Focused.IsValid()) { LastRefusal = TEXT("nothing to interact with"); return false; }
	return Focused->TryInteract(GetOwner(), &LastRefusal);
}

// ---- dev NPC actor ----------------------------------------------------------------------------------------------
AMRDevNpcActor::AMRDevNpcActor()
{
	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	RootComponent = Body;
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cyl(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	if (Cyl.Succeeded()) Body->SetStaticMesh(Cyl.Object);
	Body->SetRelativeScale3D(FVector(0.6f, 0.6f, 1.8f));
	Label = CreateDefaultSubobject<UTextRenderComponent>(TEXT("Label"));
	Label->SetupAttachment(RootComponent);
	Label->SetRelativeLocation(FVector(0.f, 0.f, 70.f)); Label->SetRelativeScale3D(FVector(1.f / 0.6f, 1.f / 0.6f, 1.f / 1.8f));
	Label->SetHorizontalAlignment(EHTA_Center); Label->SetWorldSize(18.f);
	Label->SetText(FText::FromString(TEXT("TEST FIXTURE - NONCANON NPC")));
	Interactable = CreateDefaultSubobject<UMRInteractableComponent>(TEXT("Interactable"));
}

void AMRDevNpcActor::BeginPlay()
{
	Super::BeginPlay();
	if (!NpcId.IsNone()) Interactable->NpcId = NpcId;
	Label->SetText(FText::FromString(FString::Printf(TEXT("TEST FIXTURE - NONCANON NPC\n%s"), *Interactable->NpcId.ToString())));
}
