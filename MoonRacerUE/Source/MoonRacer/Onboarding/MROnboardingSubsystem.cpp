#include "Onboarding/MROnboardingSubsystem.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Engine/GameInstance.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "MoonRacer.h"

void UMROnboardingSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Collection.InitializeDependency<UMRAvatarSaveSubsystem>();
	Super::Initialize(Collection);
	if (FParse::Param(FCommandLine::Get(), TEXT("MRProgressFresh"))) { FMRProgressStore::DeleteBoth(); } // test hook: clean slate for the dedicated slot
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UMRAvatarSaveSubsystem* AvatarSave = GI->GetSubsystem<UMRAvatarSaveSubsystem>())
		{
			AvatarSavedHandle = AvatarSave->OnAvatarSaved.AddUObject(this, &UMROnboardingSubsystem::NotifyAvatarSaved);
		}
	}
}

void UMROnboardingSubsystem::Deinitialize()
{
	if (UGameInstance* GI = GetGameInstance())
		if (UMRAvatarSaveSubsystem* AvatarSave = GI->GetSubsystem<UMRAvatarSaveSubsystem>())
			AvatarSave->OnAvatarSaved.Remove(AvatarSavedHandle);
	Super::Deinitialize();
}

void UMROnboardingSubsystem::UseDevServices(UWorld* WorldContext)
{
	UMRDevAvatarFlowService* A = NewObject<UMRDevAvatarFlowService>(this); A->WorldContext = WorldContext; AvatarService = A;
	PassportService = NewObject<UMRDevPassportService>(this);
	WorldService = NewObject<UMRDevWorldService>(this);
	UMRDevSpawnService* S = NewObject<UMRDevSpawnService>(this); S->WorldContext = WorldContext; SpawnService = S;
	CinematicService = NewObject<UMRDevCinematicService>(this);
	InteractionService = NewObject<UMRDevInteractionService>(this);
	DialogueService = NewObject<UMRDevDialogueService>(this);
	QuestService = NewObject<UMRDevQuestService>(this);
}

void UMROnboardingSubsystem::Notice(const FString& Text)
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRONB|NOTICE|%s"), *Text);
	OnNotice.Broadcast(Text);
}

void UMROnboardingSubsystem::Block(const FString& Reason, bool bRetryable)
{
	BlockReason = Reason; bBlockRetryable = bRetryable;
	TransitionLog.Add(FString::Printf(TEXT("BLOCKED %s: %s"), *MROnboarding::StateId(State).ToString(), *Reason));
	Notice(FString::Printf(TEXT("%s blocked: %s"), *MROnboarding::StateId(State).ToString(), *Reason));
}

bool UMROnboardingSubsystem::Checkpoint()
{
	const FMRProgressSaveResult R = FMRProgressStore::Save(Record);
	if (R.bOk)
	{
		++CheckpointWrites;
		CheckpointLog.Add(FString::Printf(TEXT("%s gen=%d state=%s"), *R.Slot, R.Generation, *Record.CurrentState.ToString()));
		return true;
	}
	++CheckpointFailures;
	Notice(TEXT("checkpoint write failed; progress kept in memory and retried on the next transition: ") + R.Error);
	return false;
}

void UMROnboardingSubsystem::Begin()
{
	if (bBegun) return;
	if (bLoadContentFromAsset)
	{
		if (UMROnboardingFlowAsset* Flow = Cast<UMROnboardingFlowAsset>(FSoftObjectPath(UMROnboardingFlowAsset::DefaultAssetPath()).TryLoad())) { Content = Flow->Content; }
	}
	Record = FMRProgressStore::Load(LoadReport);
	for (const FString& N : LoadReport.Notes) { UE_LOG(LogMoonRacer, Display, TEXT("MRONB|LOAD|%s"), *N); }

	FMRResumeContext Ctx;
	FMRAvatarRef Ref;
	Ctx.bAvatarValid = Avatar() ? Avatar()->HasValidConfirmedAvatar(Ref) : false;
	Ctx.CurrentAvatarId = Ref.AvatarId;
	LastResumePlan = MROnboarding::ComputeResumePlan(Record, Ctx);
	for (const FString& N : LastResumePlan.Notes) { UE_LOG(LogMoonRacer, Display, TEXT("MRONB|RESUME|%s"), *N); }
	ContinueTarget = LastResumePlan.Target;
	bAvatarRevisit = LastResumePlan.bAvatarRevisit;

	// P5A content-version safety: never reset or discard valid progress because content changed, and never trust a safe spawn recorded
	// against other content. A fresh record has nothing to compare.
	bContentVersionMismatch = false; ContentVersionNotes.Reset();
	if (!LoadReport.bFallbackFresh && !(Record.Content == ExpectedVersions))
	{
		bContentVersionMismatch = true;
		ContentVersionNotes.Add(FString::Printf(TEXT("checkpoint content versions (core=%s quest=%s dialogue=%s) differ from current (core=%s quest=%s dialogue=%s): progress kept; resuming from the default spawn; checkpoint re-stamped on the next transition"),
			*Record.Content.CoreManifestVersion.ToString(), *Record.Content.QuestRegistryVersion.ToString(), *Record.Content.DialogueVersion.ToString(),
			*ExpectedVersions.CoreManifestVersion.ToString(), *ExpectedVersions.QuestRegistryVersion.ToString(), *ExpectedVersions.DialogueVersion.ToString()));
		for (const FString& N : ContentVersionNotes) { UE_LOG(LogMoonRacer, Display, TEXT("MRONB|CONTENTVERSION|%s"), *N); Notice(N); }
	}

	State = EMROnboardingState::Start;
	bBegun = true;
	TransitionLog.Add(FString::Printf(TEXT("BEGIN resume=%s returning=%d revisit=%d fresh=%d"), *MROnboarding::StateId(ContinueTarget).ToString(), LastResumePlan.bReturningPlayer, bAvatarRevisit, LoadReport.bFallbackFresh));
	HandleEvent(LastResumePlan.bReturningPlayer ? EMROnboardingEvent::ReturningPlayer : EMROnboardingEvent::SessionStarted);
}

EMROnboardingState UMROnboardingSubsystem::ComputeNext(EMROnboardingState Cur) const
{
	EMROnboardingState Next = MROnboarding::Successor(Cur);
	// Access and identity are re-resolved on every launch (never skipped by a resume jump).
	if (Cur == EMROnboardingState::AccessCheck) return EMROnboardingState::PassportCheck;
	// Revisiting the avatar always happens right after the passport check.
	if (Cur == EMROnboardingState::PassportCheck && bAvatarRevisit) return EMROnboardingState::AvatarCheck;
	if (Cur < EMROnboardingState::FreeExplore && (int32)ContinueTarget > (int32)Next)
	{
		// Anything past CORE_SPAWN needs the level and avatar spawned first.
		if ((int32)ContinueTarget > (int32)EMROnboardingState::CoreSpawn && (int32)Cur < (int32)EMROnboardingState::CoreSpawn) return EMROnboardingState::CoreSpawn;
		return ContinueTarget;
	}
	return Next;
}

FMRTransitionResult UMROnboardingSubsystem::HandleEvent(EMROnboardingEvent Ev, const FMREventPayload& P)
{
	FMRTransitionResult R; R.From = State; R.To = State;
	auto Reject = [&](const FString& Why) -> FMRTransitionResult
	{
		R.bAccepted = false; R.Reason = Why; ++RejectedEvents;
		TransitionLog.Add(FString::Printf(TEXT("REJECT %s in %s: %s"), *MROnboarding::EventName(Ev).ToString(), *MROnboarding::StateId(State).ToString(), *Why));
		return R;
	};
	if (!bBegun) return Reject(TEXT("onboarding has not begun"));
	if (State == EMROnboardingState::FreeExplore) return Reject(TEXT("FREE_EXPLORE is terminal"));

	if (State == EMROnboardingState::Start)
	{
		if (Ev != EMROnboardingEvent::SessionStarted && Ev != EMROnboardingEvent::ReturningPlayer) return Reject(TEXT("START only accepts SessionStarted or ReturningPlayer"));
		if (Ev == EMROnboardingEvent::ReturningPlayer && !Record.Flags.bOnboardingCompleted) return Reject(TEXT("ReturningPlayer requires a completed onboarding"));
		if (Ev == EMROnboardingEvent::SessionStarted && Record.Flags.bOnboardingCompleted) return Reject(TEXT("completed players must use ReturningPlayer"));
	}
	else if (Ev != MROnboarding::ExitEventFor(State))
	{
		return Reject(TEXT("not the exit event of this state"));
	}
	if (IsBlocked()) return Reject(TEXT("state is blocked: ") + BlockReason);

	FMRProgressRecord Next = Record;
	EMROnboardingState Target = State;
	switch (State)
	{
	case EMROnboardingState::Start:
		Target = (Ev == EMROnboardingEvent::ReturningPlayer) ? EMROnboardingState::FreeExplore : EMROnboardingState::AccessCheck;
		break;
	case EMROnboardingState::AccessCheck:
		Next.Flags.bAccessResolved = true; Next.IdentityMode = EMRIdentityMode::OfflineGuest; // v1: offline only
		Target = ComputeNext(State); break;
	case EMROnboardingState::PassportCheck:
		Next.Flags.bPassportChecked = true; Target = ComputeNext(State); break;
	case EMROnboardingState::AvatarCheck:
		if (!P.AvatarRef.IsSet()) return Reject(TEXT("AvatarConfirmed requires an avatar reference"));
		Next.Flags.bAvatarConfirmed = true; Next.AvatarRef = P.AvatarRef; Target = ComputeNext(State); break;
	case EMROnboardingState::ArrivalCinematic:
		if (P.Arrival == EMRArrivalOutcome::SkippedUnavailable) { if (!Next.Flags.bArrivalSeen) Next.Flags.bArrivalSkippedUnavailable = true; }
		else { Next.Flags.bArrivalSeen = true; Next.Flags.bArrivalSkippedUnavailable = false; }
		Target = ComputeNext(State); break;
	case EMROnboardingState::CoreSpawn:
		if (P.UsedSpawnPointId.IsNone()) return Reject(TEXT("CoreReady requires the spawn point used"));
		Next.Flags.bCoreSpawned = true; Next.LastSafeSpawn.MapId = Content.CoreLocationId; Next.LastSafeSpawn.SpawnPointId = P.UsedSpawnPointId;
		Target = ComputeNext(State); break;
	case EMROnboardingState::FirstObjective: Next.Flags.bFirstObjectiveDone = true; Target = ComputeNext(State); break;
	case EMROnboardingState::TavianDialogue: Next.Flags.bTavianIntroduced = true; Target = ComputeNext(State); break;
	case EMROnboardingState::BartenderHandoff:
		Next.Flags.bBartenderHandoff = true;
		if (Next.Flags.FirstQuestStatus == EMRQuestStatus::NotOffered) Next.Flags.FirstQuestStatus = EMRQuestStatus::Offered;
		Target = ComputeNext(State); break;
	case EMROnboardingState::FirstMission: // D-6: ACCEPTED (not completed) moves on to FREE_EXPLORE
		if (Next.Flags.FirstQuestStatus != EMRQuestStatus::Completed) Next.Flags.FirstQuestStatus = EMRQuestStatus::Active;
		Next.Flags.bOnboardingCompleted = true; Target = EMROnboardingState::FreeExplore; break;
	default: return Reject(TEXT("no transition defined"));
	}

	// A jump past states is only legal if every state before the target is already done.
	for (EMROnboardingState S : MROnboarding::Spine())
	{
		if ((int32)S >= (int32)Target) break;
		if (S == EMROnboardingState::Start) continue;
		FMRProgressRecord Tmp = Next;
		if (!Tmp.IsStateDone(S) && (int32)S > (int32)State) { Target = S; break; } // fall back to the first incomplete state
	}
	Next.CurrentState = MROnboarding::StateId(Target);
	Next.Content = ExpectedVersions;   // P5A: stamp the content versions this checkpoint is written against
	const TArray<FString> Problems = Next.Validate();
	if (Problems.Num() > 0) return Reject(TEXT("would produce an inconsistent record: ") + Problems[0]);

	// Commit.
	const EMROnboardingState From = State;
	Record = Next; State = Target; R.bAccepted = true; R.To = Target;
	if (From == EMROnboardingState::AvatarCheck) bAvatarRevisit = false;
	if ((int32)Target >= (int32)ContinueTarget && Target != EMROnboardingState::AccessCheck && Target != EMROnboardingState::PassportCheck) ContinueTarget = Target;
	TransitionLog.Add(FString::Printf(TEXT("%s -> %s on %s"), *MROnboarding::StateId(From).ToString(), *MROnboarding::StateId(Target).ToString(), *MROnboarding::EventName(Ev).ToString()));
	Checkpoint();
	OnStateChanged.Broadcast(From, Target);
	EnterState(Target);
	return R;
}

void UMROnboardingSubsystem::CompleteFromService(int32 Token, EMROnboardingEvent Event, const FMREventPayload& Payload)
{
	if (Token != EnterToken) { TransitionLog.Add(TEXT("IGNORED stale service callback")); return; } // the state was left or re-entered
	HandleEvent(Event, Payload);
}

void UMROnboardingSubsystem::EnterState(EMROnboardingState S)
{
	BlockReason.Empty(); bBlockRetryable = false;
	const int32 Token = ++EnterToken;
	auto Finish = [this, Token](EMROnboardingEvent E, FMREventPayload P = FMREventPayload()) { CompleteFromService(Token, E, P); };

	switch (S)
	{
	case EMROnboardingState::AccessCheck:
		// v1 resolves to the offline prototype mode. Local prerequisites: a writable save location is probed by the first checkpoint.
		Finish(EMROnboardingEvent::AccessResolved);
		break;

	case EMROnboardingState::PassportCheck:
		if (!Passport()) { Block(TEXT("no passport service configured"), true); break; }
		Passport()->GetStatus([this, Token, Finish](EMRPassportStatus St)
		{
			if (Token != EnterToken) return;
			if (St == EMRPassportStatus::OfflineGuest) { Finish(EMROnboardingEvent::PassportChecked); return; }
			// v1 has no online identity and PASSPORT_HANDOFF is deferred (D-8): never claim an identity, let the player choose offline.
			Block(St == EMRPassportStatus::Unavailable || St == EMRPassportStatus::Error ? TEXT("identity service unavailable; call ContinueOffline() to proceed as an offline guest") : TEXT("online identity is not implemented in v1 (PASSPORT_HANDOFF deferred); call ContinueOffline()"), St == EMRPassportStatus::Unavailable || St == EMRPassportStatus::Error);
		});
		break;

	case EMROnboardingState::AvatarCheck:
	{
		if (!Avatar()) { Block(TEXT("no avatar service configured"), true); break; }
		FMRAvatarRef Ref;
		if (Avatar()->HasValidConfirmedAvatar(Ref)) { FMREventPayload P; P.AvatarRef = Ref; Finish(EMROnboardingEvent::AvatarConfirmed, P); }
		else Avatar()->OpenAvatarCreator(); // completion arrives via NotifyAvatarSaved
		break;
	}

	case EMROnboardingState::ArrivalCinematic:
	{
		FMREventPayload P;
		if (Record.Flags.bArrivalSeen) { P.Arrival = EMRArrivalOutcome::SkippedAlreadySeen; Finish(EMROnboardingEvent::ArrivalFinished, P); break; }
		if (!Cinematic() || !Cinematic()->IsCinematicAvailable(Content.ArrivalCinematicId))
		{
			Notice(TEXT("arrival cinematic unavailable; continuing without recording it as seen"));
			P.Arrival = EMRArrivalOutcome::SkippedUnavailable; Finish(EMROnboardingEvent::ArrivalFinished, P); break;
		}
		Cinematic()->Play(Content.ArrivalCinematicId, true, [Finish](EMRArrivalOutcome O) { FMREventPayload Pl; Pl.Arrival = O; Finish(EMROnboardingEvent::ArrivalFinished, Pl); });
		break;
	}

	case EMROnboardingState::CoreSpawn:
	{
		if (!World() || !Spawn()) { Block(TEXT("world/spawn service not configured"), true); break; }
		World()->LoadLocation(Content.CoreLocationId, [this, Token, Finish](EMRServiceResult LR)
		{
			if (Token != EnterToken) return;
			if (LR != EMRServiceResult::Ok) { Block(TEXT("Core content unavailable (location failed to load); retry when available"), true); return; }
			const FName Wanted = (Record.LastSafeSpawn.IsSet() && !bContentVersionMismatch) ? Record.LastSafeSpawn.SpawnPointId : Content.DefaultSpawnId;
			Spawn()->SpawnPlayer(Content.CoreLocationId, Wanted, [this, Token, Finish, Wanted](EMRServiceResult SR, FName Used)
			{
				if (Token != EnterToken) return;
				if (SR == EMRServiceResult::Ok) { FMREventPayload P; P.UsedSpawnPointId = Used; Finish(EMROnboardingEvent::CoreReady, P); return; }
				if (Wanted != Content.DefaultSpawnId) // fall back once to the default arrival spawn
				{
					Notice(TEXT("saved safe spawn failed; falling back to the default arrival spawn"));
					Spawn()->SpawnPlayer(Content.CoreLocationId, Content.DefaultSpawnId, [this, Token, Finish](EMRServiceResult SR2, FName Used2)
					{
						if (Token != EnterToken) return;
						if (SR2 == EMRServiceResult::Ok) { FMREventPayload P2; P2.UsedSpawnPointId = Used2; Finish(EMROnboardingEvent::CoreReady, P2); }
						else Block(TEXT("player spawn failed (also at the default spawn)"), true);
					});
					return;
				}
				Block(TEXT("player spawn failed"), true);
			});
		});
		break;
	}

	case EMROnboardingState::FirstObjective:
		if (!Interaction()) { Block(TEXT("interaction service not configured"), true); break; }
		Interaction()->BeginObjective(Content.ObjectiveId, [this, Token, Finish](EMRServiceResult R)
		{
			if (Token != EnterToken) return;
			if (R == EMRServiceResult::Ok) Finish(EMROnboardingEvent::ObjectiveReached); else Block(TEXT("objective unavailable"), true);
		});
		break;

	case EMROnboardingState::TavianDialogue:
	case EMROnboardingState::BartenderHandoff:
	{
		const bool bFirst = (S == EMROnboardingState::TavianDialogue);
		const FName NpcId = bFirst ? Content.FirstContactNpcId : Content.HandoffNpcId;
		const FName GraphId = bFirst ? Content.FirstContactDialogueId : Content.HandoffDialogueId;
		const EMROnboardingEvent Done = bFirst ? EMROnboardingEvent::FirstContactDone : EMROnboardingEvent::HandoffDone;
		if (!Interaction() || !Dialogue()) { Block(TEXT("interaction/dialogue service not configured"), true); break; }
		if (!Interaction()->IsNpcAvailable(NpcId)) { Block(FString::Printf(TEXT("NPC unavailable: %s"), *NpcId.ToString()), true); break; }
		if (!Dialogue()->IsDialogueAvailable(GraphId)) { Block(FString::Printf(TEXT("dialogue unavailable: %s"), *GraphId.ToString()), true); break; }
		// Checkpoints are written only on completion, so an interrupted conversation restarts (no mid-dialogue state is persisted).
		Interaction()->Interact(NpcId, [this, Token, Finish, GraphId, Done](EMRServiceResult IR)
		{
			if (Token != EnterToken) return;
			if (IR != EMRServiceResult::Ok) { Block(TEXT("NPC interaction failed"), true); return; }
			Dialogue()->RunDialogue(GraphId, [this, Token, Finish, Done](EMRServiceResult DR, FName)
			{
				if (Token != EnterToken) return;
				if (DR == EMRServiceResult::Ok) Finish(Done);
				else Block(DR == EMRServiceResult::Cancelled ? TEXT("dialogue interrupted; retry restarts it from the beginning (D-7)") : TEXT("dialogue failed"), true);
			});
		});
		break;
	}

	case EMROnboardingState::FirstMission:
		if (!Quest()) { Block(TEXT("quest service not configured"), true); break; }
		if (!Quest()->IsQuestAvailable(Content.FirstMissionId)) { Block(FString::Printf(TEXT("mission unavailable: %s"), *Content.FirstMissionId.ToString()), true); break; }
		Quest()->OfferAndAccept(Content.FirstMissionId, [this, Token, Finish](EMRServiceResult R, EMRQuestStatus St)
		{
			if (Token != EnterToken) return;
			if (R == EMRServiceResult::Ok && (St == EMRQuestStatus::Active || St == EMRQuestStatus::Completed)) Finish(EMROnboardingEvent::MissionAccepted);
			else Block(TEXT("mission could not be accepted"), true);
		});
		break;

	case EMROnboardingState::FreeExplore:
	case EMROnboardingState::Start:
	default: break;
	}
}

void UMROnboardingSubsystem::NotifyAvatarSaved(const FMRAvatarAppearance& Appearance)
{
	if (!bBegun || State != EMROnboardingState::AvatarCheck || IsBlocked()) return;
	FMREventPayload P; P.AvatarRef.AvatarId = Appearance.AvatarId; P.AvatarRef.Revision = Appearance.Revision;
	HandleEvent(EMROnboardingEvent::AvatarConfirmed, P);
}

void UMROnboardingSubsystem::Retry()
{
	if (!bBegun || !IsBlocked() || !bBlockRetryable) return;
	TransitionLog.Add(FString::Printf(TEXT("RETRY %s"), *MROnboarding::StateId(State).ToString()));
	EnterState(State);
}

bool UMROnboardingSubsystem::ContinueOffline()
{
	if (!bBegun || State != EMROnboardingState::PassportCheck || !IsBlocked()) return false;
	BlockReason.Empty();
	++EnterToken;
	HandleEvent(EMROnboardingEvent::PassportChecked);
	return true;
}

bool UMROnboardingSubsystem::RecoverToSafeSpawn()
{
	if (!bBegun || !Spawn() || !Record.LastSafeSpawn.IsSet()) return false;
	const bool bOk = Spawn()->TeleportToSafeSpawn(Record.LastSafeSpawn) == EMRServiceResult::Ok;
	TransitionLog.Add(FString::Printf(TEXT("RECOVER safe spawn %s ok=%d"), *Record.LastSafeSpawn.SpawnPointId.ToString(), bOk));
	return bOk;
}

void UMROnboardingSubsystem::ResetProgressForDev()
{
	FMRProgressStore::DeleteBoth();
	Record = FMRProgressRecord::MakeNew();
	State = EMROnboardingState::Start; bBegun = false; ContinueTarget = EMROnboardingState::AvatarCheck; bAvatarRevisit = false;
	BlockReason.Empty(); ++EnterToken;
	TransitionLog.Empty(); CheckpointLog.Empty();
}

FString UMROnboardingSubsystem::GetDebugString() const
{
	return FString::Printf(TEXT("state=%s blocked=%s | access=%d passport=%d avatar=%d arrival=%d/%d core=%d objective=%d tavian=%d bartender=%d quest=%d completed=%d | safeSpawn=%s | writes=%d fails=%d | slot=%s"),
		*MROnboarding::StateId(State).ToString(), IsBlocked() ? *BlockReason : TEXT("no"),
		Record.Flags.bAccessResolved, Record.Flags.bPassportChecked, Record.Flags.bAvatarConfirmed, Record.Flags.bArrivalSeen, Record.Flags.bArrivalSkippedUnavailable,
		Record.Flags.bCoreSpawned, Record.Flags.bFirstObjectiveDone, Record.Flags.bTavianIntroduced, Record.Flags.bBartenderHandoff, (int32)Record.Flags.FirstQuestStatus,
		Record.Flags.bOnboardingCompleted, *Record.LastSafeSpawn.SpawnPointId.ToString(), CheckpointWrites, CheckpointFailures, *FMRProgressStore::SlotBase());
}
