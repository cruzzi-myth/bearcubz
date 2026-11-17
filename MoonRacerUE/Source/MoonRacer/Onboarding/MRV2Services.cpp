#include "Onboarding/MRV2Services.h"
#include "Engine/World.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Kismet/GameplayStatics.h"

FString FMRDepartureCondition::Describe() const
{
	static const TCHAR* Names[] = { TEXT("fact set"), TEXT("dialogue completed"), TEXT("objective completed"), TEXT("mission accepted"), TEXT("mission completed") };
	return FString::Printf(TEXT("%s: %s"), Names[(int32)Type], *Subject.ToString());
}

FString FMRDepartureResult::Summary() const
{
	if (bOpen) return TEXT("departure conditions satisfied");
	return FString::Printf(TEXT("%s: %s"), bUnresolved ? TEXT("departure blocked (conditions unresolved)") : TEXT("departure blocked (conditions unmet)"), *FString::Join(Unmet, TEXT("; ")));
}

namespace MRDeparture
{
	FMRDepartureResult Evaluate(const FMRDepartureConfig& C, const FMRNarrativeEvidence& E)
	{
		FMRDepartureResult R;
		if (!C.bResolved) { R.bUnresolved = true; R.Unmet.Add(TEXT("departure conditions are not configured")); return R; }
		if (C.Conditions.Num() == 0)
		{
			if (C.bNoRequirementsByDesign) { R.bOpen = true; return R; }
			R.bUnresolved = true; R.Unmet.Add(TEXT("the condition list is empty and no-requirements was not stated explicitly")); return R;
		}
		if (!E.bAvailable) { R.bUnresolved = true; R.Unmet.Add(TEXT("narrative state is unavailable: the conditions cannot be evaluated")); return R; }
		for (const FMRDepartureCondition& Cond : C.Conditions)
		{
			bool bHolds = false;
			switch (Cond.Type)
			{
			case EMRDepartureConditionType::FactSet: bHolds = E.Facts.Contains(Cond.Subject); break;
			case EMRDepartureConditionType::DialogueCompleted: bHolds = E.CompletedDialogues.Contains(Cond.Subject); break;
			case EMRDepartureConditionType::ObjectiveCompleted: bHolds = E.CompletedObjectives.Contains(Cond.Subject); break;
			case EMRDepartureConditionType::MissionAccepted: { const EMRQuestStatus* S = E.Missions.Find(Cond.Subject); bHolds = S && (*S == EMRQuestStatus::Active || *S == EMRQuestStatus::Completed); break; }
			case EMRDepartureConditionType::MissionCompleted: { const EMRQuestStatus* S = E.Missions.Find(Cond.Subject); bHolds = S && *S == EMRQuestStatus::Completed; break; }
			}
			if (!bHolds) R.Unmet.Add(Cond.Describe());
		}
		R.bOpen = R.Unmet.Num() == 0;
		return R;
	}
}

// ---------------------------------------------------------------------------------------------------------------
void UMRDevPassportScanService::Scan(TFunction<void(const FMRScanResponse&)> Done)
{
	++ScanCount;
	FMRScanResponse R;
	switch (Mode)
	{
	case EMode::OfflineGuestSimulated: R.Outcome = EMRScanOutcome::Scanned; R.Result = EMRPassportScanResult::OfflineGuestSimulated; R.Why = TEXT("TEST FIXTURE - NONCANON: simulated offline-guest scan (not an authentication)"); break;
	case EMode::Refuse: R.Outcome = EMRScanOutcome::Refused; R.Why = TEXT("TEST FIXTURE - NONCANON: scan refused"); break;
	case EMode::Unavailable: R.Outcome = EMRScanOutcome::Unavailable; R.Why = TEXT("TEST FIXTURE - NONCANON: scanner unavailable"); break;
	case EMode::ReturnLinkedVerified: R.Outcome = EMRScanOutcome::Scanned; R.Result = EMRPassportScanResult::LinkedVerified; R.Why = TEXT("TEST FIXTURE - NONCANON: a result the dev machine must refuse"); break;
	case EMode::Hold: Pending = MoveTemp(Done); return;
	}
	Done(R);
}

void UMRDevPassportScanService::CancelScan() { if (Pending) { FMRScanResponse R; R.Outcome = EMRScanOutcome::Cancelled; R.Why = TEXT("scan interrupted"); TFunction<void(const FMRScanResponse&)> F = MoveTemp(Pending); Pending = nullptr; F(R); } }
void UMRDevPassportScanService::CompleteHeld(const FMRScanResponse& R) { if (Pending) { TFunction<void(const FMRScanResponse&)> F = MoveTemp(Pending); Pending = nullptr; F(R); } }

void UMRDevV2WorldService::LoadLocation(FName L, TFunction<void(EMRServiceResult)> Done)
{
	LoadLog.Add(L);
	if (bHold) { Pending = MoveTemp(Done); return; }
	Done(UnavailableLocations.Contains(L) ? EMRServiceResult::Unavailable : EMRServiceResult::Ok);
}

bool UMRDevV2SpawnService::Place(FName Spawn)
{
	if (!WorldContext) return true;   // pure-logic tests: record only
	AMRPlayerCharacter* Pawn = Cast<AMRPlayerCharacter>(UGameplayStatics::GetPlayerPawn(WorldContext, 0));
	const FVector* A = Anchors.Find(Spawn);
	if (!Pawn || !A) return false;
	Pawn->SetActorLocation(*A + FVector(0, 0, 100), false, nullptr, ETeleportType::TeleportPhysics);
	return true;
}

void UMRDevV2SpawnService::SpawnPlayer(FName Loc, FName Spawn, TFunction<void(EMRServiceResult, FName)> Done)
{
	SpawnLog.Add(Loc.ToString() + TEXT("/") + Spawn.ToString()); LastLocation = Loc; LastSpawn = Spawn;
	if (bHold) { Pending = MoveTemp(Done); PendingSpawn = Spawn; return; }
	if (FailingSpawns.Contains(Spawn) || !Place(Spawn)) { Done(EMRServiceResult::Failed, NAME_None); return; }
	Done(EMRServiceResult::Ok, Spawn);
}

void UMRDevV2SpawnService::CompleteHeld(EMRServiceResult R)
{
	if (!Pending) return;
	TFunction<void(EMRServiceResult, FName)> F = MoveTemp(Pending); Pending = nullptr;
	if (R == EMRServiceResult::Ok && (FailingSpawns.Contains(PendingSpawn) || !Place(PendingSpawn))) R = EMRServiceResult::Failed;
	F(R, R == EMRServiceResult::Ok ? PendingSpawn : NAME_None);
}

EMRServiceResult UMRDevV2SpawnService::TeleportToSafeSpawn(const FMRSafeSpawn& S)
{
	++TeleportCount; LastLocation = S.MapId; LastSpawn = S.SpawnPointId;
	if (!S.IsSet() || FailingSpawns.Contains(S.SpawnPointId)) return EMRServiceResult::Unavailable;
	return Place(S.SpawnPointId) ? EMRServiceResult::Ok : EMRServiceResult::Failed;
}

void UMRDevV2CinematicService::Play(FName, bool, TFunction<void(EMRArrivalOutcome)> Done)
{
	++PlayCount;
	if (bHold) { Pending = MoveTemp(Done); return; }
	Done(!bAvailable ? EMRArrivalOutcome::SkippedUnavailable : bPlayerSkips ? EMRArrivalOutcome::SkippedByPlayer : EMRArrivalOutcome::Played);
}
