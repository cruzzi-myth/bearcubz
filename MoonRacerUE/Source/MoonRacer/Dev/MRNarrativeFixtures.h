// Moon Racer - TEST FIXTURE - NONCANON narrative content (Phase 3B P5A). DEVELOPMENT ONLY.
// A tiny generic content set used to exercise the dialogue/mission/interaction machinery. It defines NO Core geography, NPC, story
// event, mission or cinematic. Every id starts with TEST_FIXTURE_, every record is flagged bTestFixture, and every string starts with
// "TEST FIXTURE - NONCANON". The validator refuses fixtures under a production policy.

#pragma once

#include "CoreMinimal.h"
#include "Narrative/MRNarrativeTypes.h"

namespace MRNarrativeFixtures
{
	inline FName TableId()          { return FName("TEST_FIXTURE_NONCANON_STRINGS"); }
	inline FName Version()          { return FName("TEST_FIXTURE_V1"); }
	inline FName NpcAlpha()         { return FName("TEST_FIXTURE_NPC_ALPHA"); }
	inline FName NpcBeta()          { return FName("TEST_FIXTURE_NPC_BETA"); }
	inline FName GraphAlpha()       { return FName("TEST_FIXTURE_DIALOGUE_ALPHA"); }
	inline FName GraphBeta()        { return FName("TEST_FIXTURE_DIALOGUE_BETA"); }
	inline FName Mission()          { return FName("TEST_FIXTURE_MISSION"); }
	inline FName Obj1()             { return FName("TEST_FIXTURE_OBJ_1"); }
	inline FName Obj2()             { return FName("TEST_FIXTURE_OBJ_2"); }
	inline FName EvtAccept()        { return FName("TEST_FIXTURE_EVT_ALPHA_ACCEPT"); }
	inline FName EvtDecline()       { return FName("TEST_FIXTURE_EVT_ALPHA_DECLINE"); }
	inline FName EvtBack()          { return FName("TEST_FIXTURE_EVT_ALPHA_BACK"); }
	inline FName EvtBetaDone()      { return FName("TEST_FIXTURE_EVT_BETA_DONE"); }
	inline FName EvtObj1()          { return FName("TEST_FIXTURE_EVT_OBJ_1"); }
	inline FName EvtObj2()          { return FName("TEST_FIXTURE_EVT_OBJ_2"); }
	inline FName FactMet()          { return FName("TEST_FIXTURE_FACT_MET_ALPHA"); }
	inline FName FactSecret()       { return FName("TEST_FIXTURE_FACT_SECRET"); }
	inline FName FxMet()            { return FName("TEST_FIXTURE_FX_MET"); }
	inline FName FxOffer()          { return FName("TEST_FIXTURE_FX_OFFER"); }
	inline FName FxAccept()         { return FName("TEST_FIXTURE_FX_ACCEPT"); }

	/** (Re)register the fixture string table. Pass a key to OMIT, to test missing-key validation. */
	void RegisterStrings(FName OmitKey = NAME_None);
	/** Build a fresh fixture bundle. Records are transient objects owned by Outer. */
	FMRNarrativeBundle Build(UObject* Outer, FName ContentVersion = Version());
}
