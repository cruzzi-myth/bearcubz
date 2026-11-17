#include "Onboarding/MROnboardingV2Machine.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Engine/GameInstance.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Narrative/MRNarrativeServices.h"
#include "Narrative/MRNarrativeSubsystem.h"
#include "Onboarding/MRDevOnboardingServices.h"
#include "MoonRacer.h"

using EState = EMROnboardingStateV2;

// ---------------------------------------------------------------------------------------------------------------
namespace
{
	int32 GOnboardingV2FlagOverride = -1;
	bool GOnboardingV2SimulateShipping = false;
	const TCHAR* EventNames[] = { TEXT("SessionStarted"), TEXT("ReturningPlayer"), TEXT("AccessResolved"), TEXT("IdentityResolved"), TEXT("AvatarConfirmed"), TEXT("StationEntered"),
		TEXT("TavernReached"), TEXT("EncounterDone"), TEXT("DepartureReached"), TEXT("PassportScanned"), TEXT("TransitFinished"), TEXT("CoreArrived") };
	static_assert(UE_ARRAY_COUNT(EventNames) == (int32)EMRV2Event::Count, "v2 event name table out of sync");
}

namespace MROnboardingV2Dev
{
	bool IsShippingBuild()
	{
#if UE_BUILD_SHIPPING
		return true;
#else
		return GOnboardingV2SimulateShipping;
#endif
	}
	bool IsFlagPresent()
	{
#if UE_BUILD_SHIPPING
		return false;
#else
		if (GOnboardingV2FlagOverride >= 0) return GOnboardingV2FlagOverride == 1;
		return FParse::Param(FCommandLine::Get(), FlagName);
#endif
	}
	bool IsAllowed(FString* Why)
	{
		if (IsShippingBuild()) { if (Why) *Why = TEXT("the v2 onboarding development path is refused in Shipping builds"); return false; }
		if (!IsFlagPresent()) { if (Why) *Why = FString::Printf(TEXT("the v2 onboarding development path requires the explicit launch flag -%s; v1 remains active"), FlagName); return false; }
		return true;
	}
	FName ActiveFlow() { return IsAllowed() ? FName("V2_DEV") : FName("V1"); }
	void SetFlagOverrideForTest(int32 Mode) { GOnboardingV2FlagOverride = Mode; }
	void SetSimulateShippingForTest(bool bShipping) { GOnboardingV2SimulateShipping = bShipping; }
}

namespace MROnboardingV2Machine
{
	FName EventName(EMRV2Event E) { return E < EMRV2Event::Count ? FName(EventNames[(int32)E]) : NAME_None; }
	EMRV2Event ExitEventFor(EState S)
	{
		switch (S)
		{
		case EState::Start: return EMRV2Event::SessionStarted;
		case EState::AccessCheck: return EMRV2Event::AccessResolved;
		case EState::IdentityCheck: return EMRV2Event::IdentityResolved;
		case EState::AvatarCheck: return EMRV2Event::AvatarConfirmed;
		case EState::StationEntry: return EMRV2Event::StationEntered;
		case EState::TavernApproach: return EMRV2Event::TavernReached;
		case EState::TavianEncounter: return EMRV2Event::EncounterDone;
		case EState::DepartureApproach: return EMRV2Event::DepartureReached;
		case EState::PassportScan: return EMRV2Event::PassportScanned;
		case EState::TransitToCore: return EMRV2Event::TransitFinished;
		case EState::CoreArrival: return EMRV2Event::CoreArrived;
		default: return EMRV2Event::Count;
		}
	}
	EState Successor(EState S) { return (int32)S + 1 < (int32)EState::Count ? (EState)((int32)S + 1) : EState::FreeExplore; }
	FName LocationFor(EState S, const FMRV2FixtureContent& C)
	{
		switch (S)
		{
		case EState::StationEntry: return C.StationLoc;
		case EState::TavernApproach: case EState::TavianEncounter: return C.TavernLoc;
		case EState::DepartureApproach: case EState::PassportScan: case EState::TransitToCore: return C.DepartureLoc;
		case EState::CoreArrival: return C.CoreLoc;
		default: return NAME_None;
		}
	}
}

// ---------------------------------------------------------------------------------------------------------------
void UMROnboardingMachineV2::BeginDestroy()
{
	if (UMRAvatarSaveSubsystem* A = BoundAvatarSave.Get()) A->OnAvatarSaved.Remove(AvatarSavedHandle);
	Super::BeginDestroy();
}

void UMROnboardingMachineV2::UseDevServices(UWorld* WorldContext)
{
	UMRDevAvatarFlowService* A = NewObject<UMRDevAvatarFlowService>(this); A->WorldContext = WorldContext; AvatarService = A;
	IdentityService = NewObject<UMRDevV2IdentityService>(this);
	ScanService = NewObject<UMRDevPassportScanService>(this);
	WorldService = NewObject<UMRDevV2WorldService>(this);
	UMRDevV2SpawnService* S = NewObject<UMRDevV2SpawnService>(this); S->WorldContext = WorldContext; SpawnService = S;
	CinematicService = NewObject<UMRDevV2CinematicService>(this);
	InteractionService = NewObject<UMRDevInteractionService>(this);
	DialogueService = NewObject<UMRDevDialogueService>(this);
}

void UMROnboardingMachineV2::BindAvatarSaveEvents(UMRAvatarSaveSubsystem* AvatarSave)
{
	if (UMRAvatarSaveSubsystem* Old = BoundAvatarSave.Get()) Old->OnAvatarSaved.Remove(AvatarSavedHandle);
	BoundAvatarSave = AvatarSave;
	if (AvatarSave) AvatarSavedHandle = AvatarSave->OnAvatarSaved.AddUObject(this, &UMROnboardingMachineV2::NotifyAvatarSaved);
}

void UMROnboardingMachineV2::Notice(const FString& Text)
{
	UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|NOTICE|%s"), *Text);
	OnNotice.Broadcast(Text);
}

void UMROnboardingMachineV2::Block(const FString& Reason, bool bRetryable)
{
	BlockReason = Reason; bBlockRetryable = bRetryable;
	TransitionLog.Add(FString::Printf(TEXT("BLOCKED %s: %s"), *MROnboardingV2::StateId(State).ToString(), *Reason));
	Notice(FString::Printf(TEXT("%s blocked: %s"), *MROnboardingV2::StateId(State).ToString(), *Reason));
}

FMRSaveEvidence UMROnboardingMachineV2::Evidence() const
{
	FMRSaveEvidence E; if (EvidenceProvider) E = EvidenceProvider();
	E.Map = MigrationMap;
	return E;
}

bool UMROnboardingMachineV2::Checkpoint()
{
	const FMRV2SaveResult R = FMRCheckpointV2Store::Save(Record);
	if (R.bOk)
	{
		++CheckpointWrites; BackupsCreated.Append(R.BackupsCreated);
		CheckpointLog.Add(FString::Printf(TEXT("%s gen=%d state=%s"), *R.Slot, R.Generation, *Record.CurrentState.ToString()));
		return true;
	}
	++CheckpointFailures;
	Notice(TEXT("checkpoint write failed; progress kept in memory and retried on the next transition: ") + R.Error);
	return false;
}

void UMROnboardingMachineV2::UpsertSpawn(FMRCheckpointV2& R, FName Loc, FName Spawn)
{
	for (FMRLocationSafeSpawn& S : R.SafeSpawns) if (S.LocationId == Loc) { S.SpawnPointId = Spawn; return; }
	FMRLocationSafeSpawn N; N.LocationId = Loc; N.SpawnPointId = Spawn; R.SafeSpawns.Add(N);
}

EState UMROnboardingMachineV2::TargetAfter(EState From, const FMRCheckpointV2& Next) const
{
	if (Next.bOnboardingCompleted) return EState::FreeExplore;
	const EState First = MROnboardingV2::FirstIncompleteState(Next), Succ = MROnboardingV2Machine::Successor(From);
	return (int32)First > (int32)Succ ? First : Succ;
}

// ---------------------------------------------------------------------------------------------------------------
bool UMROnboardingMachineV2::Begin(FString* WhyRefused)
{
	if (bBegun) return true;
	FString Why;
	if (!MROnboardingV2Dev::IsAllowed(&Why)) { if (WhyRefused) *WhyRefused = Why; UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|REFUSED|%s"), *Why); return false; }
	if (FMRProgressStore::SlotBase() == FMRCheckpointV2Store::DefaultSlotBase())
	{
		Why = TEXT("the v2 development path never runs on the default player slot: use a dedicated slot (-MRProgressSlot=...)");
		if (WhyRefused) *WhyRefused = Why; UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|REFUSED|%s"), *Why); return false;
	}

	const FMRSaveEvidence Ev = Evidence();
	FMRMigrationContext Ctx; Ctx.Narrative = Ev.Narrative; Ctx.Avatar = Ev.Avatar; Ctx.Map = MigrationMap;
	Record = FMRCheckpointV2Store::Load(Ctx, LoadReport);   // READ-ONLY: a v1 checkpoint is migrated in memory; nothing is written
	for (const FString& N : LoadReport.Notes) UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|LOAD|%s"), *N);
	if (LoadReport.bMixedConflict) Notice(TEXT("mixed v1/v2 checkpoint generations conflict: the v2 progress is kept and both files are preserved (see the load report)"));

	Consistency = MROnboardingV2::ReconcileSaves(Record, Ev);
	for (const FMRInconsistency& I : Consistency.Items) UE_LOG(LogMoonRacer, Display, TEXT("MRONBV2|RECONCILE|%s|%s"), *I.Code.ToString(), *I.Message);

	ContinueTarget = MROnboardingV2::FirstIncompleteState(Record);
	bInterruptedDialogue = Record.bTavianEncounterStarted && !Record.bTavianEncounterDone;
	if (bInterruptedDialogue) Notice(TEXT("the Tavian encounter was interrupted: it restarts from the beginning (D-7); one-time effects already applied are not repeated"));
	bContentVersionMismatch = false;
	if (!LoadReport.bFallbackFresh && !(Record.Content == ExpectedVersions))
	{
		bContentVersionMismatch = true;
		Notice(TEXT("the checkpoint was written against different content versions: progress kept; recorded safe spawns are not trusted this session; re-stamped on the next transition"));
	}
	CurrentLocation = NAME_None; ConfirmedSpawn.Reset();
	State = EState::Start; bBegun = true;
	TransitionLog.Add(FString::Printf(TEXT("BEGIN resume=%s completed=%d fresh=%d migrated=%d"), *MROnboardingV2::StateId(ContinueTarget).ToString(), Record.bOnboardingCompleted, LoadReport.bFallbackFresh, LoadReport.bMigrated));
	HandleEvent(Record.bOnboardingCompleted ? EMRV2Event::ReturningPlayer : EMRV2Event::SessionStarted);
	return true;
}

FMRV2TransitionResult UMROnboardingMachineV2::HandleEvent(EMRV2Event Ev, const FMRV2EventPayload& P)
{
	FMRV2TransitionResult R; R.From = State; R.To = State;
	auto Reject = [&](const FString& Why) -> FMRV2TransitionResult
	{
		R.bAccepted = false; R.Reason = Why; ++RejectedEvents;
		TransitionLog.Add(FString::Printf(TEXT("REJECT %s in %s: %s"), *MROnboardingV2Machine::EventName(Ev).ToString(), *MROnboardingV2::StateId(State).ToString(), *Why));
		return R;
	};
	if (!bBegun) return Reject(TEXT("onboarding has not begun"));
	if (State == EState::FreeExplore) return Reject(TEXT("FREE_EXPLORE is terminal"));
	if (State == EState::Start)
	{
		if (Ev != EMRV2Event::SessionStarted && Ev != EMRV2Event::ReturningPlayer) return Reject(TEXT("START only accepts SessionStarted or ReturningPlayer"));
		if (Ev == EMRV2Event::ReturningPlayer && !Record.bOnboardingCompleted) return Reject(TEXT("ReturningPlayer requires a completed onboarding"));
		if (Ev == EMRV2Event::SessionStarted && Record.bOnboardingCompleted) return Reject(TEXT("completed players must use ReturningPlayer"));
	}
	else if (Ev != MROnboardingV2Machine::ExitEventFor(State)) return Reject(TEXT("not the exit event of this state"));
	if (IsBlocked()) return Reject(TEXT("state is blocked: ") + BlockReason);

	if (State == EState::Start && Ev == EMRV2Event::ReturningPlayer)
	{
		// a completed (or legacy-completed) player: nothing new to persist, so nothing is written and nothing is migrated on disk
		const EState From = State; State = EState::FreeExplore; R.bAccepted = true; R.To = State;
		TransitionLog.Add(TEXT("START -> FREE_EXPLORE on ReturningPlayer (no checkpoint: the record is already complete)"));
		OnStateChanged.Broadcast(From, State); EnterState(State);
		return R;
	}
	FMRCheckpointV2 Next = Record; EState Target = State;
	auto SpawnFor = [&](FName Loc) -> FName { return !P.UsedSpawnPointId.IsNone() ? P.UsedSpawnPointId : ConfirmedSpawn.FindRef(Loc); };
	switch (State)
	{
	case EState::Start: Target = (Ev == EMRV2Event::ReturningPlayer) ? EState::FreeExplore : EState::AccessCheck; break;
	case EState::AccessCheck: Next.bAccessResolved = true; Next.IdentityMode = EMRIdentityMode::OfflineGuest; Target = EState::IdentityCheck; break;   // re-run on every launch
	case EState::IdentityCheck: Next.bIdentityResolved = true; Target = EState::AvatarCheck; break;                                                       // the avatar is re-verified on every launch
	case EState::AvatarCheck:
		if (!P.AvatarRef.IsSet()) return Reject(TEXT("AvatarConfirmed requires an avatar reference"));
		Next.bAvatarConfirmed = true; Next.AvatarRef = P.AvatarRef; Target = TargetAfter(State, Next); break;
	case EState::StationEntry:
	{
		const FName U = SpawnFor(Content.StationLoc); if (U.IsNone()) return Reject(TEXT("StationEntered requires a confirmed spawn (the station is not entered before it loads and the player is placed)"));
		Next.bStationEntered = true; UpsertSpawn(Next, Content.StationLoc, U); Target = TargetAfter(State, Next); break;
	}
	case EState::TavernApproach:
	{
		const FName U = SpawnFor(Content.TavernLoc); if (U.IsNone()) return Reject(TEXT("TavernReached requires a confirmed spawn"));
		Next.bTavernReached = true; UpsertSpawn(Next, Content.TavernLoc, U); Target = TargetAfter(State, Next); break;
	}
	case EState::TavianEncounter: Next.bTavianEncounterStarted = true; Next.bTavianEncounterDone = true; Target = TargetAfter(State, Next); break;
	case EState::DepartureApproach:
	{
		const FName U = SpawnFor(Content.DepartureLoc); if (U.IsNone()) return Reject(TEXT("DepartureReached requires a confirmed spawn"));
		Next.bDepartureReached = true; UpsertSpawn(Next, Content.DepartureLoc, U); Target = TargetAfter(State, Next); break;
	}
	case EState::PassportScan:
		if (P.Scan != EMRPassportScanResult::OfflineGuestSimulated) return Reject(TEXT("only an OfflineGuestSimulated scan result is accepted by the development path (a simulated scan is not an authentication)"));
		Next.PassportScanResult = P.Scan; Next.TravelAuthorization = EMRTravelAuthorization::Authorized; Target = TargetAfter(State, Next); break;
	case EState::TransitToCore:
		if (Next.TravelAuthorization != EMRTravelAuthorization::Authorized) return Reject(TEXT("transit requires a recorded travel authorization"));
		if (P.Cinematic == EMRArrivalOutcome::SkippedUnavailable) { if (!Next.bTransitSeen) Next.bTransitSkippedUnavailable = true; }
		else { Next.bTransitSeen = true; Next.bTransitSkippedUnavailable = false; }
		Target = TargetAfter(State, Next); break;
	case EState::CoreArrival:
	{
		const FName U = SpawnFor(Content.CoreLoc); if (U.IsNone()) return Reject(TEXT("CoreArrived requires a confirmed spawn (arrival is not complete before the destination loads and the player is placed)"));
		Next.bCoreArrived = true; UpsertSpawn(Next, Content.CoreLoc, U); Next.bOnboardingCompleted = true; Target = EState::FreeExplore; break;
	}
	default: return Reject(TEXT("no transition defined"));
	}

	Next.CurrentState = MROnboardingV2::StateId(Target);
	Next.Content = ExpectedVersions;
	const TArray<FString> Problems = Next.Validate();
	if (Problems.Num() > 0) return Reject(TEXT("would produce an inconsistent record: ") + Problems[0]);

	const EState From = State;
	Record = Next; State = Target; R.bAccepted = true; R.To = Target;
	TransitionLog.Add(FString::Printf(TEXT("%s -> %s on %s"), *MROnboardingV2::StateId(From).ToString(), *MROnboardingV2::StateId(Target).ToString(), *MROnboardingV2Machine::EventName(Ev).ToString()));
	Checkpoint();   // state-boundary checkpoint: written ONLY here (and at the encounter-started marker), never mid-load
	OnStateChanged.Broadcast(From, Target);
	EnterState(Target);
	return R;
}

void UMROnboardingMachineV2::Finish(int32 Token, EMRV2Event E, const FMRV2EventPayload& P)
{
	if (Token != EnterToken) { TransitionLog.Add(TEXT("IGNORED stale service callback")); return; }
	HandleEvent(E, P);
}

void UMROnboardingMachineV2::EnsureLocation(int32 Token, FName Loc, TFunction<void()> Then)
{
	if (!World() || !Spawn()) { Block(TEXT("world/spawn service not configured"), true); return; }
	if (CurrentLocation == Loc && ConfirmedSpawn.Contains(Loc)) { Then(); return; }
	World()->LoadLocation(Loc, [this, Token, Loc, Then](EMRServiceResult LR)
	{
		if (Token != EnterToken) return;
		if (LR != EMRServiceResult::Ok) { Block(FString::Printf(TEXT("location unavailable (failed to load): %s; retry when available"), *Loc.ToString()), true); return; }
		const FMRLocationSafeSpawn* Saved = Record.FindSafeSpawn(Loc);
		const FName Def = Content.DefaultSpawnFor(Loc);
		const FName Wanted = (Saved && !bContentVersionMismatch) ? Saved->SpawnPointId : Def;
		auto Confirmed = [this, Loc, Then](FName Used) { CurrentLocation = Loc; ConfirmedSpawn.Add(Loc, Used); Then(); };   // ONLY here is the location considered reached
		Spawn()->SpawnPlayer(Loc, Wanted, [this, Token, Loc, Wanted, Def, Confirmed](EMRServiceResult SR, FName Used)
		{
			if (Token != EnterToken) return;
			if (SR == EMRServiceResult::Ok && !Used.IsNone()) { Confirmed(Used); return; }
			if (Wanted != Def)
			{
				Notice(TEXT("the saved safe spawn failed; falling back to the default spawn of the location"));
				Spawn()->SpawnPlayer(Loc, Def, [this, Token, Confirmed](EMRServiceResult SR2, FName Used2)
				{
					if (Token != EnterToken) return;
					if (SR2 == EMRServiceResult::Ok && !Used2.IsNone()) Confirmed(Used2); else Block(TEXT("player spawn failed (also at the default spawn)"), true);
				});
				return;
			}
			Block(TEXT("player spawn failed"), true);
		});
	});
}

void UMROnboardingMachineV2::EnterState(EState S)
{
	BlockReason.Empty(); bBlockRetryable = false;
	const int32 Token = ++EnterToken;
	if (bManualDrive) return;
	switch (S)
	{
	case EState::AccessCheck: Finish(Token, EMRV2Event::AccessResolved, FMRV2EventPayload()); break;
	case EState::IdentityCheck:
		if (!Identity()) { Block(TEXT("no identity service configured"), true); break; }
		Identity()->GetStatus([this, Token](EMRPassportStatus St)
		{
			if (Token != EnterToken) return;
			if (St == EMRPassportStatus::OfflineGuest) { Finish(Token, EMRV2Event::IdentityResolved, FMRV2EventPayload()); return; }
			Block(St == EMRPassportStatus::Unavailable || St == EMRPassportStatus::Error ? TEXT("identity service unavailable; call ContinueOffline() to proceed as an offline guest") : TEXT("online identity is not implemented in the v2 development path; call ContinueOffline()"),
				St == EMRPassportStatus::Unavailable || St == EMRPassportStatus::Error);
		});
		break;
	case EState::AvatarCheck:
	{
		if (!Avatar()) { Block(TEXT("no avatar service configured"), true); break; }
		FMRAvatarRef Ref;
		if (Avatar()->HasValidConfirmedAvatar(Ref)) { FMRV2EventPayload P; P.AvatarRef = Ref; Finish(Token, EMRV2Event::AvatarConfirmed, P); }
		else Avatar()->OpenAvatarCreator();   // completion arrives via NotifyAvatarSaved
		break;
	}
	case EState::StationEntry: case EState::TavernApproach: case EState::TavianEncounter: case EState::DepartureApproach:
	case EState::PassportScan: case EState::TransitToCore: case EState::CoreArrival:
		EnsureLocation(Token, MROnboardingV2Machine::LocationFor(S, Content), [this, Token, S]() { RunLocated(Token, S); });
		break;
	default: break;
	}
}

void UMROnboardingMachineV2::RunLocated(int32 Token, EState S)
{
	if (Token != EnterToken) return;
	auto Payload = [this](FName Loc) { FMRV2EventPayload P; P.UsedSpawnPointId = ConfirmedSpawn.FindRef(Loc); return P; };
	switch (S)
	{
	case EState::StationEntry: Finish(Token, EMRV2Event::StationEntered, Payload(Content.StationLoc)); break;
	case EState::TavernApproach:
		if (!Interaction()) { Block(TEXT("interaction service not configured"), true); break; }
		Interaction()->BeginObjective(Content.TavernObjective, [this, Token, Payload](EMRServiceResult R)
		{ if (Token != EnterToken) return; if (R == EMRServiceResult::Ok) Finish(Token, EMRV2Event::TavernReached, Payload(Content.TavernLoc)); else Block(TEXT("objective unavailable"), true); });
		break;
	case EState::TavianEncounter:
	{
		if (!Interaction() || !Dialogue()) { Block(TEXT("interaction/dialogue service not configured"), true); break; }
		if (!Interaction()->IsNpcAvailable(Content.EncounterNpc)) { Block(FString::Printf(TEXT("NPC unavailable: %s"), *Content.EncounterNpc.ToString()), true); break; }
		if (!Dialogue()->IsDialogueAvailable(Content.EncounterDialogue)) { Block(FString::Printf(TEXT("dialogue unavailable: %s"), *Content.EncounterDialogue.ToString()), true); break; }
		if (!Record.bTavianEncounterStarted)
		{
			FMRCheckpointV2 Next = Record; Next.bTavianEncounterStarted = true; Next.Content = ExpectedVersions;
			if (Next.Validate().Num() == 0) { Record = Next; Checkpoint(); }   // the encounter-STARTED marker: lets an interruption be recognised and restarted
		}
		else { bInterruptedDialogue = true; TransitionLog.Add(TEXT("RESTART interrupted Tavian encounter from the beginning (D-7)")); }
		Interaction()->Interact(Content.EncounterNpc, [this, Token, Payload](EMRServiceResult IR)
		{
			if (Token != EnterToken) return;
			if (IR != EMRServiceResult::Ok) { Block(TEXT("NPC interaction failed"), true); return; }
			Dialogue()->RunDialogue(Content.EncounterDialogue, [this, Token, Payload](EMRServiceResult DR, FName)
			{
				if (Token != EnterToken) return;
				if (DR == EMRServiceResult::Ok) Finish(Token, EMRV2Event::EncounterDone, Payload(Content.TavernLoc));
				else Block(DR == EMRServiceResult::Cancelled ? TEXT("dialogue interrupted; retry restarts it from the beginning (D-7)") : TEXT("dialogue failed"), true);
			});
		});
		break;
	}
	case EState::DepartureApproach:
		if (!Interaction()) { Block(TEXT("interaction service not configured"), true); break; }
		Interaction()->BeginObjective(Content.DepartureObjective, [this, Token, Payload](EMRServiceResult R)
		{ if (Token != EnterToken) return; if (R == EMRServiceResult::Ok) Finish(Token, EMRV2Event::DepartureReached, Payload(Content.DepartureLoc)); else Block(TEXT("objective unavailable"), true); });
		break;
	case EState::PassportScan:
	{
		const FMRDepartureResult Gate = EvaluateDeparture();
		if (!Gate.bOpen) { Block(Gate.Summary(), true); break; }   // the terminal does not even scan until departure is allowed
		if (!Scan()) { Block(TEXT("no passport-scan service configured"), true); break; }
		Scan()->Scan([this, Token](const FMRScanResponse& Resp)
		{
			if (Token != EnterToken) return;
			if (Resp.Outcome == EMRScanOutcome::Scanned)
			{
				if (Resp.Result == EMRPassportScanResult::OfflineGuestSimulated) { FMRV2EventPayload P; P.Scan = Resp.Result; Finish(Token, EMRV2Event::PassportScanned, P); }
				else Block(FString::Printf(TEXT("scan result %d is not supported by the development path"), (int32)Resp.Result), true);
				return;
			}
			Block(Resp.Outcome == EMRScanOutcome::Cancelled ? TEXT("scan interrupted; nothing was recorded; retry scans again")
				: Resp.Outcome == EMRScanOutcome::Refused ? TEXT("scan refused; retry") : TEXT("scanner unavailable; retry"), true);
		});
		break;
	}
	case EState::TransitToCore:
	{
		const FMRDepartureResult Gate = EvaluateDeparture();
		if (!Gate.bOpen) { Block(Gate.Summary(), true); break; }
		if (Record.TravelAuthorization != EMRTravelAuthorization::Authorized) { Block(TEXT("travel is not authorized"), true); break; }
		if (!World() || !World()->IsLocationAvailable(Content.CoreLoc)) { Block(FString::Printf(TEXT("destination unavailable: %s; transit does not start"), *Content.CoreLoc.ToString()), true); break; }
		auto Done = [this, Token](EMRArrivalOutcome O) { FMRV2EventPayload P; P.Cinematic = O; Finish(Token, EMRV2Event::TransitFinished, P); };
		if (!Cinematic() || !Cinematic()->IsCinematicAvailable(Content.TransitCinematic)) { Notice(TEXT("transit cinematic unavailable; continuing without recording it as seen")); Done(EMRArrivalOutcome::SkippedUnavailable); break; }
		Cinematic()->Play(Content.TransitCinematic, true, Done);   // nothing is recorded until it finishes: an interrupted transit resumes here
		break;
	}
	case EState::CoreArrival: Finish(Token, EMRV2Event::CoreArrived, Payload(Content.CoreLoc)); break;
	default: break;
	}
}

// ---------------------------------------------------------------------------------------------------------------
void UMROnboardingMachineV2::NotifyAvatarSaved(const FMRAvatarAppearance& Appearance)
{
	if (!bBegun || State != EState::AvatarCheck || IsBlocked()) return;
	FMRV2EventPayload P; P.AvatarRef.AvatarId = Appearance.AvatarId; P.AvatarRef.Revision = Appearance.Revision;
	HandleEvent(EMRV2Event::AvatarConfirmed, P);
}

void UMROnboardingMachineV2::Retry()
{
	if (!bBegun || !IsBlocked() || !bBlockRetryable) return;
	TransitionLog.Add(FString::Printf(TEXT("RETRY %s"), *MROnboardingV2::StateId(State).ToString()));
	EnterState(State);
}

bool UMROnboardingMachineV2::ContinueOffline()
{
	if (!bBegun || State != EState::IdentityCheck || !IsBlocked()) return false;
	BlockReason.Empty(); ++EnterToken;
	HandleEvent(EMRV2Event::IdentityResolved);
	return true;
}

bool UMROnboardingMachineV2::RecoverToSafeSpawn()
{
	if (!bBegun || !Spawn()) return false;
	const FName Loc = State == EState::FreeExplore ? Content.CoreLoc : MROnboardingV2Machine::LocationFor(State, Content);
	if (Loc.IsNone()) return false;
	FMRSafeSpawn S; S.MapId = Loc;
	if (const FMRLocationSafeSpawn* Saved = Record.FindSafeSpawn(Loc)) S.SpawnPointId = Saved->SpawnPointId; else if (const FName* C = ConfirmedSpawn.Find(Loc)) S.SpawnPointId = *C;
	if (!S.IsSet()) return false;
	const bool bOk = Spawn()->TeleportToSafeSpawn(S) == EMRServiceResult::Ok;
	TransitionLog.Add(FString::Printf(TEXT("RECOVER safe spawn %s/%s ok=%d"), *S.MapId.ToString(), *S.SpawnPointId.ToString(), bOk));
	return bOk;
}

bool UMROnboardingMachineV2::InteractOptional(FName NpcId, FString* Why)
{
	auto No = [&](const TCHAR* W) { if (Why) *Why = W; return false; };
	if (!bBegun) return No(TEXT("onboarding has not begun"));
	if (State < EState::TavernApproach) return No(TEXT("not in the world yet"));
	if (NpcId == Content.EncounterNpc && !Record.bTavianEncounterDone) return No(TEXT("that NPC is part of the onboarding flow"));
	if (!OptionalConversationStarter) return No(TEXT("no narrative runtime is bound"));
	return OptionalConversationStarter(NpcId, Why);   // never changes onboarding progress and never checkpoints
}

const FMRConsistencyReport& UMROnboardingMachineV2::Reconcile() { Consistency = MROnboardingV2::ReconcileSaves(Record, Evidence()); return Consistency; }
FMRDepartureResult UMROnboardingMachineV2::EvaluateDeparture() const { return MRDeparture::Evaluate(Content.Departure, Evidence().Narrative); }

FString UMROnboardingMachineV2::GetDebugString() const
{
	return FString::Printf(TEXT("state=%s blocked=%s | access=%d identity=%d avatar=%d station=%d tavern=%d encStarted=%d encDone=%d departure=%d scan=%d auth=%d transit=%d/%d core=%d completed=%d legacy=%d | spawns=%d | writes=%d fails=%d | slot=%s"),
		*MROnboardingV2::StateId(State).ToString(), IsBlocked() ? *BlockReason : TEXT("no"), Record.bAccessResolved, Record.bIdentityResolved, Record.bAvatarConfirmed, Record.bStationEntered, Record.bTavernReached,
		Record.bTavianEncounterStarted, Record.bTavianEncounterDone, Record.bDepartureReached, (int32)Record.PassportScanResult, (int32)Record.TravelAuthorization, Record.bTransitSeen, Record.bTransitSkippedUnavailable,
		Record.bCoreArrived, Record.bOnboardingCompleted, Record.bLegacyCompleted, Record.SafeSpawns.Num(), CheckpointWrites, CheckpointFailures, *FMRProgressStore::SlotBase());
}

// ---------------------------------------------------------------------------------------------------------------
namespace MRNarrative
{
	void BindOnboardingV2(UMROnboardingMachineV2* M, UMRNarrativeSubsystem* Nar, UMRAvatarSaveSubsystem* AvatarSave)
	{
		if (!M || !Nar) return;
		Nar->Setup();
		UMRNarrativeInteractionService* I = NewObject<UMRNarrativeInteractionService>(M); I->Narrative = Nar;
		M->DialogueService = Nar->GetRuntime(); M->InteractionService = I;
		M->ExpectedVersions = Nar->GetContentVersions();
		TWeakObjectPtr<UMRNarrativeSubsystem> WN(Nar); TWeakObjectPtr<UMRAvatarSaveSubsystem> WA(AvatarSave);
		M->OptionalConversationStarter = [WN](FName Npc, FString* Why) { return WN.IsValid() && WN->StartConversation(Npc, Why); };
		M->EvidenceProvider = [WN, WA]()
		{
			FMRSaveEvidence E;
			if (WN.IsValid()) E.Narrative = FMRNarrativeEvidence::From(WN->GetState());   // the LIVE narrative state (never a guess)
			if (UMRAvatarSaveSubsystem* A = WA.Get())
			{
				FMRAvatarLoadReport LR; const FMRAvatarAppearance App = A->LoadAppearance(LR);
				E.Avatar.bChecked = true; E.Avatar.bMalformedPreserved = LR.bRejectedMalformed; E.Avatar.bNewerRejected = LR.bRejectedNewerVersion;
				E.Avatar.bValid = LR.bFoundSave && !LR.bRejectedMalformed && !LR.bRejectedNewerVersion;
				if (E.Avatar.bValid) { E.Avatar.AvatarId = App.AvatarId; E.Avatar.Revision = App.Revision; }
			}
			return E;
		};
	}
}
