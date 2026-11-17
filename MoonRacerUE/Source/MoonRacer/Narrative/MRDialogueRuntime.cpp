#include "Narrative/MRDialogueRuntime.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "MoonRacer.h"

bool UMRDialogueRuntime::IsDialogueAvailable(FName GraphId) { return Owner && Owner->FindGraph(GraphId) != nullptr; }

void UMRDialogueRuntime::RunDialogue(FName GraphId, TFunction<void(EMRServiceResult, FName)> Done)
{
	FString Why;
	const bool bStarted = Start(GraphId, [Done](const FMRDialogueResult& R)
	{
		if (Done) Done(R.Finish == EMRDialogueFinish::Completed ? EMRServiceResult::Ok : R.Finish == EMRDialogueFinish::Cancelled ? EMRServiceResult::Cancelled : EMRServiceResult::Failed, R.EndNodeId);
	}, &Why);
	if (!bStarted) { UE_LOG(LogMoonRacer, Warning, TEXT("MRNARR|DIALOGUE|start refused: %s"), *Why); if (Done) Done(EMRServiceResult::Unavailable, NAME_None); }
}

bool UMRDialogueRuntime::Start(FName GraphId, TFunction<void(const FMRDialogueResult&)> Done, FString* Why)
{
	auto Refuse = [&](const TCHAR* W) { if (Why) *Why = W; return false; };
	if (!Owner) return Refuse(TEXT("runtime not initialised"));
	if (View.bActive) return Refuse(TEXT("a conversation is already active"));
	const UMRDialogueGraph* G = Owner->FindGraph(GraphId);
	if (!G) return Refuse(TEXT("unknown dialogue graph"));
	Graph = G; DoneCb = MoveTemp(Done);
	View = FMRDialogueView(); View.bActive = true; View.GraphId = GraphId;
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|DIALOGUE|start %s"), *GraphId.ToString());
	Enter(G->StartNodeId);
	return true;
}

void UMRDialogueRuntime::BuildSpeaker(const FMRDialogueNode& N)
{
	View.SpeakerNpcId = N.SpeakerNpcId;
	if (N.SpeakerNpcId.IsNone()) { View.Speaker = MRNarrative::UiText(TEXT("player")); return; }
	const UMRNpcRecord* Npc = Owner->FindNpc(N.SpeakerNpcId);
	View.Speaker = Npc ? MRNarrative::ResolveText(Npc->StringTableId, Npc->DisplayNameKey) : FText::FromString(TEXT("[UNKNOWN SPEAKER]"));
}

void UMRDialogueRuntime::Enter(FName NodeId)
{
	for (int32 Guard = 0; Guard < 256; ++Guard)
	{
		const FMRDialogueNode* N = Graph ? Graph->FindNode(NodeId) : nullptr;
		if (!N) { FinishWith(EMRDialogueFinish::Failed, NAME_None, NAME_None, FString::Printf(TEXT("missing node '%s'"), *NodeId.ToString())); return; }
		View.NodeId = N->NodeId;
		for (const FMRDialogueEffect& E : N->OnEnterEffects) Owner->ApplyEffect(E);

		switch (N->Type)
		{
		case EMRDialogueNodeType::Line:
			BuildSpeaker(*N); View.Text = MRNarrative::ResolveText(Graph->StringTableId, N->TextKey);
			View.Choices.Reset(); View.bCanContinue = true;
			OnViewChanged.Broadcast(); return;

		case EMRDialogueNodeType::Choice:
		{
			BuildSpeaker(*N); View.Text = MRNarrative::ResolveText(Graph->StringTableId, N->TextKey);
			View.Choices.Reset(); View.bCanContinue = false;
			for (const FMRDialogueChoice& C : N->Choices)
				if (Owner->EvaluateConditions(C.Conditions)) View.Choices.Add({ C.ChoiceId, MRNarrative::ResolveText(Graph->StringTableId, C.TextKey) });
			if (View.Choices.Num() == 0) { FinishWith(EMRDialogueFinish::Failed, NAME_None, NAME_None, FString::Printf(TEXT("no available choice at '%s'"), *N->NodeId.ToString())); return; }
			OnViewChanged.Broadcast(); return;
		}

		case EMRDialogueNodeType::Branch:
		{
			const FMRDialogueChoice* Taken = nullptr;
			for (const FMRDialogueChoice& C : N->Choices) if (Owner->EvaluateConditions(C.Conditions)) { Taken = &C; break; }
			if (!Taken) { FinishWith(EMRDialogueFinish::Failed, NAME_None, NAME_None, FString::Printf(TEXT("no branch taken at '%s'"), *N->NodeId.ToString())); return; }
			for (const FMRDialogueEffect& E : Taken->Effects) Owner->ApplyEffect(E);
			NodeId = Taken->NextNodeId; continue;
		}

		case EMRDialogueNodeType::End:
			FinishWith(EMRDialogueFinish::Completed, N->NodeId, N->CompletionEventId, FString()); return;
		}
	}
	FinishWith(EMRDialogueFinish::Failed, NAME_None, NAME_None, TEXT("too many automatic steps (silent loop)"));
}

bool UMRDialogueRuntime::Continue()
{
	if (!View.bActive || !View.bCanContinue || !Graph) return false;
	const FMRDialogueNode* N = Graph->FindNode(View.NodeId);
	if (!N || N->Type != EMRDialogueNodeType::Line) return false;
	View.bCanContinue = false;
	Enter(N->NextNodeId);
	return true;
}

bool UMRDialogueRuntime::Choose(FName ChoiceId)
{
	if (!View.bActive || View.Choices.Num() == 0 || !Graph) return false;
	const FMRDialogueNode* N = Graph->FindNode(View.NodeId);
	if (!N || N->Type != EMRDialogueNodeType::Choice) return false;
	bool bOffered = false; for (const FMRDialogueChoiceView& V : View.Choices) bOffered |= (V.ChoiceId == ChoiceId);
	if (!bOffered) return false; // hidden or unknown choices can never be taken
	for (const FMRDialogueChoice& C : N->Choices)
	{
		if (C.ChoiceId != ChoiceId) continue;
		View.Choices.Reset();
		for (const FMRDialogueEffect& E : C.Effects) Owner->ApplyEffect(E);
		Enter(C.NextNodeId);
		return true;
	}
	return false;
}

bool UMRDialogueRuntime::ChooseIndex(int32 Index) { return View.Choices.IsValidIndex(Index) && Choose(View.Choices[Index].ChoiceId); }

void UMRDialogueRuntime::Cancel(const FString& Reason)
{
	if (!View.bActive) return;
	FinishWith(EMRDialogueFinish::Cancelled, NAME_None, NAME_None, Reason);
}

void UMRDialogueRuntime::FinishWith(EMRDialogueFinish How, FName EndNodeId, FName CompletionEvent, const FString& Why)
{
	FMRDialogueResult R; R.Finish = How; R.GraphId = View.GraphId; R.EndNodeId = EndNodeId; R.CompletionEventId = CompletionEvent; R.Why = Why;
	if (How == EMRDialogueFinish::Completed) { ++NumCompleted; R.bFirstCompletion = Owner->RecordDialogueCompleted(R.GraphId); }
	else if (How == EMRDialogueFinish::Cancelled) ++NumCancelled; else ++NumFailed;
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|DIALOGUE|finish %s %s end=%s event=%s %s"), *R.GraphId.ToString(), How == EMRDialogueFinish::Completed ? TEXT("COMPLETED") : How == EMRDialogueFinish::Cancelled ? TEXT("CANCELLED") : TEXT("FAILED"), *EndNodeId.ToString(), *CompletionEvent.ToString(), *Why);
	View = FMRDialogueView(); Graph = nullptr;
	TFunction<void(const FMRDialogueResult&)> Cb = MoveTemp(DoneCb); DoneCb = nullptr;
	OnViewChanged.Broadcast();
	OnFinished.Broadcast(R);
	if (How == EMRDialogueFinish::Completed) Owner->NotifyDialogueCompleted(R);
	if (Cb) Cb(R);
}
