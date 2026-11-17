// Moon Racer - narrative content validation (Phase 3B P5A). Pure functions; never mutates content.
// A bundle that produces ANY error is rejected as a whole by the registry (nothing partial is registered).

#pragma once

#include "CoreMinimal.h"
#include "Narrative/MRNarrativeTypes.h"

struct MOONRACER_API FMRDiagnostic
{
	bool bError = true;
	FName Code;       // stable machine-readable code, e.g. DANGLING_EDGE
	FName RecordId;   // the record (or "bundle") the problem is in
	FString Message;  // actionable: says what is wrong and how to fix it
	FString ToString() const { return FString::Printf(TEXT("%s %s [%s]: %s"), bError ? TEXT("ERROR") : TEXT("WARN"), *Code.ToString(), *RecordId.ToString(), *Message); }
};

struct MOONRACER_API FMRValidationReport
{
	TArray<FMRDiagnostic> Items;
	void Error(const TCHAR* Code, FName Record, const FString& Msg) { Items.Add({ true, FName(Code), Record, Msg }); }
	void Warn(const TCHAR* Code, FName Record, const FString& Msg) { Items.Add({ false, FName(Code), Record, Msg }); }
	int32 NumErrors() const { int32 N = 0; for (const FMRDiagnostic& D : Items) N += D.bError ? 1 : 0; return N; }
	bool HasErrors() const { return NumErrors() > 0; }
	bool HasCode(const TCHAR* Code) const { for (const FMRDiagnostic& D : Items) if (D.Code == FName(Code)) return true; return false; }
	FString Summary() const { FString S; for (const FMRDiagnostic& D : Items) S += D.ToString() + TEXT("\n"); return S; }
};

struct FMRValidationPolicy
{
	/** false = production policy: any fixture record is an error. */
	bool bAllowTestFixtures = true;
};

namespace MRNarrative
{
	/** StringLookup (optional): decides whether (table, key) exists. Default = the live string-table registry. The importer passes its STAGED strings so a
	 *  bundle can be validated BEFORE anything is registered or written. */
	MOONRACER_API void ValidateBundle(const FMRNarrativeBundle& Bundle, const FMRValidationPolicy& Policy, FMRValidationReport& Out, const TFunction<bool(FName, FName)>* StringLookup = nullptr);
	/** Version shared by all graphs and NPCs ("dialogue version") / by all missions ("quest registry version"); None if empty. */
	MOONRACER_API FName DialogueVersionOf(const FMRNarrativeBundle& Bundle);
	MOONRACER_API FName QuestVersionOf(const FMRNarrativeBundle& Bundle);
}
