#include "Narrative/MRNarrativeServices.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "Onboarding/MROnboardingSubsystem.h"

bool UMRNarrativeQuestService::IsQuestAvailable(FName QuestId) { return Narrative && Narrative->FindMission(QuestId) != nullptr; }

void UMRNarrativeQuestService::OfferAndAccept(FName QuestId, TFunction<void(EMRServiceResult, EMRQuestStatus)> Done)
{
	if (!Narrative || !Narrative->FindMission(QuestId)) { if (Done) Done(EMRServiceResult::Unavailable, EMRQuestStatus::NotOffered); return; }
	Narrative->OfferMission(QuestId);
	Narrative->AcceptMission(QuestId);
	if (Done) Done(EMRServiceResult::Ok, Narrative->GetMissionStatus(QuestId));
}

void UMRNarrativeInteractionService::BeginObjective(FName ObjectiveId, TFunction<void(EMRServiceResult)> Done)
{
	if (!Narrative) { if (Done) Done(EMRServiceResult::Unavailable); return; }
	Narrative->BeginStandaloneObjective(ObjectiveId, MoveTemp(Done));
}
bool UMRNarrativeInteractionService::IsNpcAvailable(FName NpcId) { return Narrative && Narrative->IsNpcAvailable(NpcId); }
void UMRNarrativeInteractionService::Interact(FName NpcId, TFunction<void(EMRServiceResult)> Done)
{
	if (Done) Done(IsNpcAvailable(NpcId) ? EMRServiceResult::Ok : EMRServiceResult::Unavailable);
}

namespace MRNarrative
{
	void BindOnboarding(UMROnboardingSubsystem* Onb, UMRNarrativeSubsystem* Nar)
	{
		if (!Onb || !Nar) return;
		Nar->Setup();
		UMRNarrativeQuestService* Q = NewObject<UMRNarrativeQuestService>(Onb); Q->Narrative = Nar;
		UMRNarrativeInteractionService* I = NewObject<UMRNarrativeInteractionService>(Onb); I->Narrative = Nar;
		Onb->DialogueService = Nar->GetRuntime(); Onb->QuestService = Q; Onb->InteractionService = I;
		Onb->ExpectedVersions = Nar->GetContentVersions();
	}
}
