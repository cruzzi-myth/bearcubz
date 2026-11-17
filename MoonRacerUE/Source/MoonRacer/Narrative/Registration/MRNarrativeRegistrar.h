// Moon Racer - narrative content REGISTRATION layer (Phase 3B P5B-1). CONTENT-INDEPENDENT.
//
// Importing a bundle (P5B-0) never makes it live. Registering is a separate, explicit act with its own policy:
//   * the request must name an environment (Unspecified is refused) and the process may not be LESS restrictive than the request allows
//     (a Production process refuses a Development request, so fixtures are unreachable there);
//   * the selected bundle is loaded from one generated folder and verified against that folder's own import metadata (identity, hashes,
//     classification, versions, provenance, string keys, full validation) BEFORE anything is touched;
//   * existing narrative saves are checked for incompatibility; a conflict is reported and NOTHING changes (registry and save preserved);
//   * the swap is all-or-nothing: any failure restores the previous registry, including its string tables;
//   * a history of successful registrations supports explicit rollback to a previously validated bundle (re-verified like any registration).
// No part of this touches the onboarding flow or its content ids.

#pragma once

#include "CoreMinimal.h"
#include "Narrative/Import/MRNarrativeImporter.h"
#include "Narrative/MRNarrativeSubsystem.h"

struct FMRRegistrationRequest
{
	EMREnvironment Environment = EMREnvironment::Unspecified;   // REQUIRED
	FString OutputRoot = TEXT("/Game/MoonRacer/Narrative/Generated");
	FString BundleId;                                           // REQUIRED
	FString BundleHash;                                         // empty = the ACTIVE bundle; otherwise exactly this complete generated folder (rollback / pinning)
	bool bAcceptRemovedMissions = false;                        // explicit acknowledgement that saved Active/Offered missions missing from the new bundle stay retained-but-unapplied
	bool bLoadSaveAfter = true;                                 // re-load the narrative save against the new registry after a successful registration
};

struct FMRRegistrationResult
{
	bool bOk = false;
	FString BundleId, BundleHash;
	FMRValidationReport Report;
	TArray<FString> Conflicts;            // save-compatibility conflicts (registration refused)
	TArray<FString> Notes;                // informational (e.g. retained-but-unapplied progress)
	FMRNarrativeLoadInfo Load;            // result of re-loading the save (when bLoadSaveAfter)
	FString Summary() const;
};

class MOONRACER_API FMRNarrativeRegistrar
{
public:
	/** Load, verify and register the selected bundle. On ANY failure the previous registry (and the save) is left exactly as it was. */
	static FMRRegistrationResult Register(UMRNarrativeSubsystem* Subsystem, const FMRRegistrationRequest& Request);
	/** The verification + commit core, for an already-loaded bundle (tests tamper with the loaded records through this). */
	static FMRRegistrationResult RegisterLoaded(UMRNarrativeSubsystem* Subsystem, const FMRRegistrationRequest& Request, FMRLoadedBundle& Loaded);
	/** Explicitly re-register the previously registered bundle (full re-verification). Environment/root come from the template request. */
	static FMRRegistrationResult Rollback(UMRNarrativeSubsystem* Subsystem, const FMRRegistrationRequest& Template);

	/** TEST HOOK: 0 = off; 1 = fail before strings are registered; 2 = fail after strings, before the swap; 3 = fail after the swap. Every step must restore the previous registry. */
	static int32 GFailAtStep;
};
