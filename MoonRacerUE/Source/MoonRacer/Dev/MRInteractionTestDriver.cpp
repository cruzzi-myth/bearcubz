#include "Dev/MRInteractionTestDriver.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Dev/MRNarrativeFixtures.h"
#include "Engine/GameInstance.h"
#include "Engine/GameViewportClient.h"
#include "EngineUtils.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "UnrealClient.h"
#include "Narrative/MRInteraction.h"
#include "Narrative/MRNarrativeHud.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "Widgets/SWindow.h"
#include "MoonRacer.h"

using namespace MRNarrativeFixtures;

AMRInteractionTestDriver::AMRInteractionTestDriver() { PrimaryActorTick.bCanEverTick = true; }
UMRNarrativeSubsystem* AMRInteractionTestDriver::Nar() const { return GetGameInstance() ? GetGameInstance()->GetSubsystem<UMRNarrativeSubsystem>() : nullptr; }
AMRPlayerCharacter* AMRInteractionTestDriver::Pawn() const { return Cast<AMRPlayerCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)); }

void AMRInteractionTestDriver::Check(const FString& Name, bool bPass, const FString& Detail)
{
	(bPass ? NumPass : NumFail)++;
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|CHECK|%s|%s|%s"), bPass ? TEXT("PASS") : TEXT("FAIL"), *Name, *Detail);
}

void AMRInteractionTestDriver::Finish()
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|RESULT|%s|%s|pass=%d|fail=%d"), *Mode, NumFail == 0 ? TEXT("PASS") : TEXT("FAIL"), NumPass, NumFail);
	UKismetSystemLibrary::QuitGame(this, UGameplayStatics::GetPlayerController(this, 0), EQuitPreference::Quit, false);
}

void AMRInteractionTestDriver::BeginPlay()
{
	Super::BeginPlay();
	if (!FParse::Value(FCommandLine::Get(), TEXT("MRNarrTest="), Mode) || Mode.IsEmpty()) { SetActorTickEnabled(false); return; }
	if (FMRNarrativeStore::IsDefaultSlot() || UMRAvatarSaveSubsystem::GetSlotName() == TEXT("MRAvatar_Local"))
	{
		UE_LOG(LogMoonRacer, Error, TEXT("MRNARR|REFUSED|dev test mode needs dedicated slots (-MRNarrativeSlot=... -MRAvatarSlot=...); refusing to touch the default player slots"));
		SetActorTickEnabled(false); return;
	}
	if (Mode == TEXT("interact")) BuildInteract(); else if (Mode == TEXT("resume")) BuildResume(); else { SetActorTickEnabled(false); return; }
	bRunning = true;
	UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|BEGIN|mode=%s|narrativeSlot=%s|avatarSlot=%s"), *Mode, *FMRNarrativeStore::SlotBase(), *UMRAvatarSaveSubsystem::GetSlotName());
}

void AMRInteractionTestDriver::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!bRunning) return;
	StepTimer += Dt;
	if (StepIndex >= Steps.Num()) { bRunning = false; Finish(); return; }
	if (StepTimer >= Steps[StepIndex].Delay) { StepTimer = 0.f; const int32 I = StepIndex++; Steps[I].Fn(); }
}

AMRDevNpcActor* AMRInteractionTestDriver::FindNpc(FName NpcId) const
{
	for (TActorIterator<AMRDevNpcActor> It(GetWorld()); It; ++It) if (It->NpcId == NpcId) return *It;
	return nullptr;
}

void AMRInteractionTestDriver::TeleportNear(AMRDevNpcActor* Npc, float Dx)
{
	if (!Npc || !Pawn()) return;
	const FVector L = Npc->GetActorLocation();
	Pawn()->SetActorLocation(FVector(L.X + Dx, L.Y, 100.f), false, nullptr, ETeleportType::TeleportPhysics);
}

void AMRInteractionTestDriver::PressKeyViaController(const FKey& Key, EInputEvent Ev)
{
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0)) PC->InputKey(FInputKeyEventArgs::CreateSimulated(Key, Ev, Ev == IE_Pressed ? 1.f : 0.f));
}

void AMRInteractionTestDriver::SlateKey(const FKey& Key)
{
	if (!FSlateApplication::IsInitialized()) return;
	const FKeyEvent Down(Key, FModifierKeysState(), FSlateApplicationBase::SlateAppPrimaryPlatformUser, false, 0, 0);
	FSlateApplication::Get().ProcessKeyDownEvent(Down);
	FSlateApplication::Get().ProcessKeyUpEvent(Down);
}

void AMRInteractionTestDriver::Pointer(int32 Kind, FVector2D Pos)
{
	if (!FSlateApplication::IsInitialized()) return;
	TSharedPtr<FGenericWindow> Native;
	if (GEngine && GEngine->GameViewport && GEngine->GameViewport->GetWindow().IsValid()) Native = GEngine->GameViewport->GetWindow()->GetNativeWindow();
	const FModifierKeysState Mods;
	const uint32 User = FSlateApplicationBase::CursorUserIndex, Ptr = FSlateApplicationBase::CursorPointerIndex;
	const FVector2f P((float)Pos.X, (float)Pos.Y), L((float)LastPointer.X, (float)LastPointer.Y);
	TSet<FKey> Pressed; if (Kind == 1) Pressed.Add(EKeys::LeftMouseButton);
	switch (Kind)
	{
	case 0: FSlateApplication::Get().ProcessMouseMoveEvent(FPointerEvent(User, Ptr, P, L, Pressed, FKey(), 0.f, Mods)); break;
	case 1: FSlateApplication::Get().ProcessMouseButtonDownEvent(Native, FPointerEvent(User, Ptr, P, P, Pressed, EKeys::LeftMouseButton, 0.f, Mods)); break;
	case 2: FSlateApplication::Get().ProcessMouseButtonUpEvent(FPointerEvent(User, Ptr, P, P, Pressed, EKeys::LeftMouseButton, 0.f, Mods)); break;
	}
	LastPointer = Pos;
}

bool AMRInteractionTestDriver::Setup()
{
	UMRNarrativeSubsystem* N = Nar(); AMRPlayerCharacter* P = Pawn();
	if (!N || !P) { Check(TEXT("Setup_SubsystemAndPawn"), false); return false; }
	if (FParse::Param(FCommandLine::Get(), TEXT("MRNarrativeFresh"))) FMRNarrativeStore::Delete();   // dedicated slot only (guarded above)
	RegisterStrings();
	FMRNarrativeBundle B = Build(GetGameInstance());
	FMRValidationReport R;
	const bool bOk = N->RegisterBundle(B, FMRValidationPolicy(), R);
	Check(TEXT("Setup_FixtureBundleValidatedAndRegistered"), bOk, R.Summary());
	Interactor = NewObject<UMRInteractorComponent>(P); Interactor->RegisterComponent();
	Check(TEXT("Setup_FixtureNpcActorsPlaced"), FindNpc(NpcAlpha()) && FindNpc(NpcBeta()) && FindNpc(FName("TEST_FIXTURE_NPC_UNREGISTERED")));
	return bOk && Interactor;
}

// ---------------------------------------------------------------------------------------------------------------
void AMRInteractionTestDriver::BuildInteract()
{
	Add(2.0f, [this]()
	{
		if (!Setup()) { StepIndex = Steps.Num(); return; }
		Nar()->LoadState();   // fresh slot (-MRNarrativeFresh) => empty state
	});
	Add(0.6f, [this]()
	{
		UMRNarrativeHudWidget* H = Interactor->GetHud();
		Check(TEXT("Hud_CreatedAndKeyBound"), H != nullptr && Interactor->IsKeyBound(), FString::Printf(TEXT("hud=%d key=%d"), H != nullptr, Interactor->IsKeyBound()));
		Check(TEXT("Range_FarFromEveryNpcNothingFocused"), Interactor->GetFocused() == nullptr && H && !H->IsPromptVisible());
		Check(TEXT("Input_InteractWithNothingIsRefused"), !Interactor->Interact() && Interactor->LastRefusal.Contains(TEXT("nothing")), Interactor->LastRefusal);
		TeleportNear(FindNpc(NpcAlpha()), -200.f);   // inside the 250 range
	});
	Add(0.4f, [this]()
	{
		UMRNarrativeHudWidget* H = Interactor->GetHud();
		UMRInteractableComponent* F = Interactor->GetFocused();
		Check(TEXT("Range_InsideRangeFocusesAlpha"), F && F->NpcId == NpcAlpha());
		if (FParse::Param(FCommandLine::Get(), TEXT("MRNarrShot"))) FScreenshotRequest::RequestScreenshot(TEXT("MRNarr_Prompt"), true, false);
		Check(TEXT("Prompt_ShownWithNpcName"), H && H->IsPromptVisible() && H->GetPromptString().Contains(TEXT("Press E")) && H->GetPromptString().Contains(TEXT("TEST FIXTURE - NONCANON Alpha")), H ? H->GetPromptString() : TEXT("-"));
		TeleportNear(FindNpc(NpcAlpha()), -270.f);   // just outside
	});
	Add(0.4f, [this]()
	{
		Check(TEXT("Range_JustOutsideNotFocused"), Interactor->GetFocused() == nullptr && !Interactor->GetHud()->IsPromptVisible());
		TeleportNear(FindNpc(NpcAlpha()), -230.f);   // just inside
	});
	Add(0.4f, [this]()
	{
		Check(TEXT("Range_JustInsideFocused"), Interactor->GetFocused() && Interactor->GetFocused()->NpcId == NpcAlpha());
		FindNpc(NpcAlpha())->Interactable->bForceUnavailable = true;
	});
	Add(0.4f, [this]()
	{
		Check(TEXT("Availability_UnavailableNpcNotFocused"), Interactor->GetFocused() == nullptr && !Interactor->GetHud()->IsPromptVisible());
		Check(TEXT("Availability_InteractRefused"), !Interactor->Interact() && !Nar()->GetRuntime()->IsActive(), Interactor->LastRefusal);
		FindNpc(NpcAlpha())->Interactable->bForceUnavailable = false;
		TeleportNear(FindNpc(FName("TEST_FIXTURE_NPC_UNREGISTERED")), -100.f);
	});
	Add(0.4f, [this]()
	{
		Check(TEXT("MissingContent_UnregisteredNpcIsNotInteractable"), Interactor->GetFocused() == nullptr && !Interactor->Interact() && !Nar()->GetRuntime()->IsActive(), Interactor->LastRefusal);
		TeleportNear(FindNpc(NpcAlpha()), -200.f);
	});
	Add(0.4f, [this]() { PressKeyViaController(EKeys::E, IE_Pressed); });
	Add(0.3f, [this]()
	{
		PressKeyViaController(EKeys::E, IE_Released);
		UMRNarrativeHudWidget* H = Interactor->GetHud(); UMRDialogueRuntime* R = Nar()->GetRuntime();
		APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
		Check(TEXT("Input_EKeyStartsDialogue"), R->IsActive() && R->GetView().GraphId == GraphAlpha(), R->IsActive() ? R->GetView().NodeId.ToString() : TEXT("not active"));
		Check(TEXT("Hud_DialoguePanelShowsSpeakerAndText"), H->IsDialoguePanelVisible() && H->GetSpeakerString() == TEXT("TEST FIXTURE - NONCANON Alpha") && H->GetDialogueString().Contains(TEXT("alpha line one")), H->GetSpeakerString() + TEXT(" / ") + H->GetDialogueString());
		Check(TEXT("Hud_ContinueVisibleAndPromptHidden"), H->IsContinueVisible() && !H->IsPromptVisible());
		Check(TEXT("Hud_PlayerMovementBlockedMouseShown"), PC && PC->IsMoveInputIgnored() && PC->bShowMouseCursor);
		Check(TEXT("Interaction_StartedOnce"), FindNpc(NpcAlpha())->Interactable->NumInteractions == 1);
	});
	Add(0.3f, [this]()
	{
		PressKeyViaController(EKeys::E, IE_Pressed);   // pressing E during a conversation must not start another
	});
	Add(0.3f, [this]()
	{
		PressKeyViaController(EKeys::E, IE_Released);
		Check(TEXT("Input_EDuringConversationIgnored"), FindNpc(NpcAlpha())->Interactable->NumInteractions == 1 && Nar()->GetRuntime()->GetView().NodeId == FName("n_start"));
		SlateKey(EKeys::Enter);   // keyboard Continue through Slate
	});
	Add(0.4f, [this]()
	{
		UMRNarrativeHudWidget* H = Interactor->GetHud(); UMRDialogueRuntime* R = Nar()->GetRuntime();
		Check(TEXT("Keyboard_EnterContinuesToChoices"), R->GetView().NodeId == FName("n_ask") && H->NumChoiceButtons() == 2 && !H->IsContinueVisible(), R->GetView().NodeId.ToString());
		Check(TEXT("Choices_HiddenConditionalChoiceNotShown"), H->NumChoiceButtons() == 2 && H->GetChoiceString(0).Contains(TEXT("response yes")) && H->GetChoiceString(1).Contains(TEXT("response no")));
		Check(TEXT("Keyboard_FirstChoiceSelected"), H->GetSelectedIndex() == 0 && H->GetChoiceString(0).StartsWith(TEXT(">")));
		if (FParse::Param(FCommandLine::Get(), TEXT("MRNarrShot"))) FScreenshotRequest::RequestScreenshot(TEXT("MRNarr_DialogueChoices"), true, false);
		SlateKey(EKeys::Down);
	});
	Add(0.3f, [this]()
	{
		UMRNarrativeHudWidget* H = Interactor->GetHud();
		Check(TEXT("Keyboard_DownMovesSelection"), H->GetSelectedIndex() == 1 && H->GetChoiceString(1).StartsWith(TEXT(">")) && !H->GetChoiceString(0).StartsWith(TEXT(">")));
		SlateKey(EKeys::Up);
	});
	Add(0.3f, [this]()
	{
		Check(TEXT("Keyboard_UpMovesSelectionBack"), Interactor->GetHud()->GetSelectedIndex() == 0);
		SlateKey(EKeys::Escape);   // cancel
	});
	Add(0.4f, [this]()
	{
		UMRNarrativeHudWidget* H = Interactor->GetHud(); UMRDialogueRuntime* R = Nar()->GetRuntime(); APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
		Check(TEXT("Cancel_EscapeEndsConversation"), !R->IsActive() && R->NumCancelled == 1 && !H->IsDialoguePanelVisible());
		Check(TEXT("Cancel_NothingRecordedAsCompleted"), !Nar()->GetState().CompletedDialogues.Contains(GraphAlpha()) && Nar()->GetMissionStatus(Mission()) == EMRQuestStatus::NotOffered);
		Check(TEXT("Cancel_InputRestored"), PC && !PC->IsMoveInputIgnored() && !PC->bShowMouseCursor);
		PressKeyViaController(EKeys::E, IE_Pressed);
	});
	Add(0.3f, [this]()
	{
		PressKeyViaController(EKeys::E, IE_Released);
		UMRDialogueRuntime* R = Nar()->GetRuntime();
		Check(TEXT("Restart_StartsFromTheFirstNode"), R->IsActive() && R->GetView().NodeId == FName("n_start"));
		Check(TEXT("Restart_OneTimeEffectNotRepeated"), Nar()->EffectsSuppressed >= 1 && Nar()->EffectsApplied == 1, FString::Printf(TEXT("applied=%d suppressed=%d"), Nar()->EffectsApplied, Nar()->EffectsSuppressed));
		SlateKey(EKeys::Enter);
	});
	Add(0.4f, [this]()
	{
		// real mouse: put the OS cursor on choice 0 ("yes") and click it
		FVector2D C;
		const bool bFound = Interactor->GetHud()->GetChoiceButtonCenter(0, C);
		Check(TEXT("Mouse_ChoiceButtonLaidOut"), bFound, FString::Printf(TEXT("(%.0f,%.0f)"), C.X, C.Y));
		if (bFound) { FSlateApplication::Get().SetCursorPos(C); Pointer(0, C); LastPointer = C; }
	});
	Add(0.3f, [this]() { Pointer(1, LastPointer); });
	Add(0.15f, [this]() { Pointer(2, LastPointer); });
	Add(0.4f, [this]()
	{
		UMRDialogueRuntime* R = Nar()->GetRuntime();
		Check(TEXT("Mouse_ClickChoosesResponse"), R->IsActive() && R->GetView().NodeId == FName("n_yes"), R->IsActive() ? R->GetView().NodeId.ToString() : TEXT("not active"));
		Check(TEXT("Choices_OfferEffectFiredOnce"), Nar()->GetMissionStatus(Mission()) == EMRQuestStatus::Offered);
		SlateKey(EKeys::SpaceBar);   // Continue with Space
	});
	Add(0.4f, [this]()
	{
		UMRNarrativeHudWidget* H = Interactor->GetHud(); UMRDialogueRuntime* R = Nar()->GetRuntime();
		Check(TEXT("Completion_ConversationFinished"), !R->IsActive() && R->NumCompleted == 1 && Nar()->GetState().CompletedDialogues.Contains(GraphAlpha()) && !H->IsDialoguePanelVisible());
		Check(TEXT("Mission_AcceptedByDialogueEffect"), Nar()->GetMissionStatus(Mission()) == EMRQuestStatus::Active);
		Check(TEXT("Tracker_ShowsFirstObjective"), H->IsTrackerVisible() && H->GetTrackerString().Contains(TEXT("objective one")), H->GetTrackerString());
		Nar()->NotifyGameEvent(EvtObj1());
	});
	Add(0.3f, [this]()
	{
		UMRNarrativeHudWidget* H = Interactor->GetHud();
		Check(TEXT("Tracker_AdvancesToSecondObjective"), H->IsTrackerVisible() && H->GetTrackerString().Contains(TEXT("objective two")), H->GetTrackerString());
		if (FParse::Param(FCommandLine::Get(), TEXT("MRNarrShot"))) FScreenshotRequest::RequestScreenshot(TEXT("MRNarr_Tracker"), true, false);
		Check(TEXT("Save_NarrativeStatePersistedOnDisk"), IFileManager::Get().FileExists(*FMRNarrativeStore::FilePath()) && Nar()->SaveFailures == 0);
		UE_LOG(LogMoonRacer, Display, TEXT("MRNARR|INTERRUPT|quitting mid-mission"));
	});
	Add(0.3f, [this]() { Finish(); });
}

void AMRInteractionTestDriver::BuildResume()
{
	Add(2.0f, [this]()
	{
		if (!Setup()) { StepIndex = Steps.Num(); return; }
		const FMRNarrativeLoadInfo L = Nar()->LoadState();
		Check(TEXT("Resume_StateLoadedAndVerified"), L.Store.bValid && !L.bVersionMismatch, L.Store.Why);
		Check(TEXT("Resume_MissionStillActive"), Nar()->GetMissionStatus(Mission()) == EMRQuestStatus::Active && Nar()->IsObjectiveCompleted(Obj1()) && !Nar()->IsObjectiveCompleted(Obj2()));
		Check(TEXT("Resume_OneTimeLedgerRestored"), Nar()->GetState().FiredEffects.Contains(FxAccept()) && Nar()->GetState().FiredEffects.Contains(FxMet()));
		TeleportNear(FindNpc(NpcAlpha()), -200.f);
	});
	Add(0.6f, [this]()
	{
		UMRNarrativeHudWidget* H = Interactor->GetHud();
		Nar()->OnTrackerChanged.Broadcast();   // the HUD was built after LoadState in this process; refresh it as the game would on load
		Check(TEXT("Resume_TrackerShowsSecondObjective"), H && H->IsTrackerVisible() && H->GetTrackerString().Contains(TEXT("objective two")), H ? H->GetTrackerString() : TEXT("-"));
		PressKeyViaController(EKeys::E, IE_Pressed);
	});
	Add(0.3f, [this]()
	{
		PressKeyViaController(EKeys::E, IE_Released);
		UMRNarrativeHudWidget* H = Interactor->GetHud(); UMRDialogueRuntime* R = Nar()->GetRuntime();
		Check(TEXT("Resume_ConversationOpensOnItsFirstNode"), R->IsActive() && R->GetView().NodeId == FName("n_start"), R->IsActive() ? R->GetView().NodeId.ToString() : TEXT("not active"));
		SlateKey(EKeys::Enter);
	});
	Add(0.4f, [this]()
	{
		UMRNarrativeHudWidget* H = Interactor->GetHud(); UMRDialogueRuntime* R = Nar()->GetRuntime();
		Check(TEXT("Resume_ReturningBranchAfterRelaunch"), R->IsActive() && R->GetView().NodeId == FName("n_back") && H->GetDialogueString().Contains(TEXT("returning line")), R->IsActive() ? R->GetView().NodeId.ToString() : TEXT("not active"));
		SlateKey(EKeys::Enter);
	});
	Add(0.4f, [this]()
	{
		UMRDialogueRuntime* R = Nar()->GetRuntime();
		Check(TEXT("Resume_ConversationCompletesWithoutRepeatingEffects"), !R->IsActive() && R->NumCompleted == 1 && Nar()->EffectsApplied == 0, FString::Printf(TEXT("applied=%d suppressed=%d"), Nar()->EffectsApplied, Nar()->EffectsSuppressed));
		Nar()->NotifyGameEvent(EvtObj2());
	});
	Add(0.3f, [this]()
	{
		Check(TEXT("Resume_MissionCompletesAfterRelaunch"), Nar()->GetMissionStatus(Mission()) == EMRQuestStatus::Completed && !Interactor->GetHud()->IsTrackerVisible());
	});
	Add(0.3f, [this]() { Finish(); });
}
