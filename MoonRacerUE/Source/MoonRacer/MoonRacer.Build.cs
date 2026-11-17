// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class MoonRacer : ModuleRules
{
	public MoonRacer(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"AIModule",
			"StateTreeModule",
			"GameplayStateTreeModule",
			"UMG",
			"Slate"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { "Json", "SlateCore" });

		PublicIncludePaths.AddRange(new string[] {
			"MoonRacer",
			"MoonRacer/Variant_Platforming",
			"MoonRacer/Variant_Platforming/Animation",
			"MoonRacer/Variant_Combat",
			"MoonRacer/Variant_Combat/AI",
			"MoonRacer/Variant_Combat/Animation",
			"MoonRacer/Variant_Combat/Gameplay",
			"MoonRacer/Variant_Combat/Interfaces",
			"MoonRacer/Variant_Combat/UI",
			"MoonRacer/Variant_SideScrolling",
			"MoonRacer/Variant_SideScrolling/AI",
			"MoonRacer/Variant_SideScrolling/Gameplay",
			"MoonRacer/Variant_SideScrolling/Interfaces",
			"MoonRacer/Variant_SideScrolling/UI"
		});

		// Uncomment if you are using Slate UI
		// PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });

		// Uncomment if you are using online features
		// PrivateDependencyModuleNames.Add("OnlineSubsystem");

		// To include OnlineSubsystemSteam, add it to the plugins section in your uproject file with the Enabled attribute set to true
	}
}
