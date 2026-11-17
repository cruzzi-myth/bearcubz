// Moon Racer - narrative-backed implementations of the onboarding service interfaces (Phase 3B P5A).
// They let the EXISTING onboarding state machine run against the narrative registry (dialogue graphs, missions, NPC availability)
// without changing the state machine. They contain no content: whatever the registry holds is what they serve.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "Onboarding/MRIntegrationInterfaces.h"
#include "MRNarrativeServices.generated.h"

class UMRNarrativeSubsystem;
class UMROnboardingSubsystem;

UCLASS()
class MOONRACER_API UMRNarrativeQuestService : public UObject, public IMRQuestService
{
	GENERATED_BODY()
public:
	UPROPERTY(Transient) TObjectPtr<UMRNarrativeSubsystem> Narrative;
	virtual bool IsQuestAvailable(FName QuestId) override;
	/** D-6: onboarding only needs the mission ACCEPTED. Idempotent: a mission already accepted (e.g. by a dialogue effect) is not re-accepted. */
	virtual void OfferAndAccept(FName QuestId, TFunction<void(EMRServiceResult, EMRQuestStatus)> Done) override;
};

UCLASS()
class MOONRACER_API UMRNarrativeInteractionService : public UObject, public IMRInteractionService
{
	GENERATED_BODY()
public:
	UPROPERTY(Transient) TObjectPtr<UMRNarrativeSubsystem> Narrative;
	virtual void BeginObjective(FName ObjectiveId, TFunction<void(EMRServiceResult)> Done) override;
	virtual bool IsNpcAvailable(FName NpcId) override;
	virtual void Interact(FName NpcId, TFunction<void(EMRServiceResult)> Done) override;
};

namespace MRNarrative
{
	/** Point the onboarding subsystem's dialogue, quest and interaction seams at the narrative registry and adopt its content versions.
	 *  Does not touch the other seams (world, spawn, cinematic, avatar, passport) and does not change the state machine. */
	MOONRACER_API void BindOnboarding(UMROnboardingSubsystem* Onboarding, UMRNarrativeSubsystem* Narrative);
}
