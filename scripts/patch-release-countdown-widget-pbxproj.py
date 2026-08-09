#!/usr/bin/env python3
"""Patch ios/App/App.xcodeproj/project.pbxproj to add ReleaseCountdownWidget + shared sources."""

from pathlib import Path

PBX = Path(__file__).resolve().parents[1] / "ios/App/App.xcodeproj/project.pbxproj"
text = PBX.read_text()

# --- Idempotency ---
if "ReleaseCountdownWidget" in text and "HomeWidgetBridgePlugin.swift" in text:
    print("pbxproj already contains widget/plugin entries; skipping")
    raise SystemExit(0)

# Insert PBXBuildFile entries
build_files = """
		DHRCWBF01 /* HomeWidgetBridgePlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR01 /* HomeWidgetBridgePlugin.swift */; };
		DHRCWBF02 /* HomeWidgetAppGroup.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR02 /* HomeWidgetAppGroup.swift */; };
		DHRCWBF03 /* HomeWidgetPayloadModels.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR03 /* HomeWidgetPayloadModels.swift */; };
		DHRCWBF04 /* HomeWidgetUtcCountdown.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR04 /* HomeWidgetUtcCountdown.swift */; };
		DHRCWBF05 /* HomeWidgetAppGroup.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR02 /* HomeWidgetAppGroup.swift */; };
		DHRCWBF06 /* HomeWidgetPayloadModels.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR03 /* HomeWidgetPayloadModels.swift */; };
		DHRCWBF07 /* HomeWidgetUtcCountdown.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR04 /* HomeWidgetUtcCountdown.swift */; };
		DHRCWBF08 /* ReleaseCountdownWidgetBundle.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR05 /* ReleaseCountdownWidgetBundle.swift */; };
		DHRCWBF09 /* ReleaseCountdownWidget.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR06 /* ReleaseCountdownWidget.swift */; };
		DHRCWBF0A /* ReleaseCountdownEntry.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR07 /* ReleaseCountdownEntry.swift */; };
		DHRCWBF0B /* ReleaseCountdownProvider.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR08 /* ReleaseCountdownProvider.swift */; };
		DHRCWBF0C /* ReleaseCountdownViews.swift in Sources */ = {isa = PBXBuildFile; fileRef = DHRCWFR09 /* ReleaseCountdownViews.swift */; };
		DHRCWBF0D /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = DHRCWFR0A /* Assets.xcassets */; };
		DHRCWBF0E /* WidgetKit.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = DHRCWFR0B /* WidgetKit.framework */; };
		DHRCWBF0F /* SwiftUI.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = DHRCWFR0C /* SwiftUI.framework */; };
		DHRCWBF10 /* ReleaseCountdownWidget.appex in Embed Foundation Extensions */ = {isa = PBXBuildFile; fileRef = DHRCWFR0D /* ReleaseCountdownWidget.appex */; settings = {ATTRIBUTES = (RemoveHeadersOnCopy, ); }; };
		DHRCWBF11 /* WidgetKit.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = DHRCWFR0B /* WidgetKit.framework */; };
"""

text = text.replace(
    "/* End PBXBuildFile section */",
    build_files + "/* End PBXBuildFile section */",
)

# PBXContainerItemProxy
container = """
/* Begin PBXContainerItemProxy section */
		DHRCWIP01 /* PBXContainerItemProxy */ = {
			isa = PBXContainerItemProxy;
			containerPortal = 504EC2FC1FED79650016851F /* Project object */;
			proxyType = 1;
			remoteGlobalIDString = DHRCWNT01;
			remoteInfo = ReleaseCountdownWidget;
		};
/* End PBXContainerItemProxy section */

"""
text = text.replace(
    "/* Begin PBXFileReference section */",
    container + "/* Begin PBXFileReference section */",
)

# File references
file_refs = """
		DHRCWFR01 /* HomeWidgetBridgePlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = HomeWidgetBridgePlugin.swift; sourceTree = "<group>"; };
		DHRCWFR02 /* HomeWidgetAppGroup.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = HomeWidgetAppGroup.swift; sourceTree = "<group>"; };
		DHRCWFR03 /* HomeWidgetPayloadModels.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = HomeWidgetPayloadModels.swift; sourceTree = "<group>"; };
		DHRCWFR04 /* HomeWidgetUtcCountdown.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = HomeWidgetUtcCountdown.swift; sourceTree = "<group>"; };
		DHRCWFR05 /* ReleaseCountdownWidgetBundle.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ReleaseCountdownWidgetBundle.swift; sourceTree = "<group>"; };
		DHRCWFR06 /* ReleaseCountdownWidget.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ReleaseCountdownWidget.swift; sourceTree = "<group>"; };
		DHRCWFR07 /* ReleaseCountdownEntry.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ReleaseCountdownEntry.swift; sourceTree = "<group>"; };
		DHRCWFR08 /* ReleaseCountdownProvider.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ReleaseCountdownProvider.swift; sourceTree = "<group>"; };
		DHRCWFR09 /* ReleaseCountdownViews.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ReleaseCountdownViews.swift; sourceTree = "<group>"; };
		DHRCWFR0A /* Assets.xcassets */ = {isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; };
		DHRCWFR0B /* WidgetKit.framework */ = {isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = WidgetKit.framework; path = System/Library/Frameworks/WidgetKit.framework; sourceTree = SDKROOT; };
		DHRCWFR0C /* SwiftUI.framework */ = {isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = SwiftUI.framework; path = System/Library/Frameworks/SwiftUI.framework; sourceTree = SDKROOT; };
		DHRCWFR0D /* ReleaseCountdownWidget.appex */ = {isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = ReleaseCountdownWidget.appex; sourceTree = BUILT_PRODUCTS_DIR; };
		DHRCWFR0E /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
		DHRCWFR0F /* ReleaseCountdownWidget.entitlements */ = {isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = ReleaseCountdownWidget.entitlements; sourceTree = "<group>"; };
"""

text = text.replace(
    "/* End PBXFileReference section */",
    file_refs + "/* End PBXFileReference section */",
)

# Copy files embed phase
copy_phase = """
/* Begin PBXCopyFilesBuildPhase section */
		DHRCWCP01 /* Embed Foundation Extensions */ = {
			isa = PBXCopyFilesBuildPhase;
			buildActionMask = 2147483647;
			dstPath = "";
			dstSubfolderSpec = 13;
			files = (
				DHRCWBF10 /* ReleaseCountdownWidget.appex in Embed Foundation Extensions */,
			);
			name = "Embed Foundation Extensions";
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXCopyFilesBuildPhase section */

"""
text = text.replace(
    "/* Begin PBXFrameworksBuildPhase section */",
    copy_phase + "/* Begin PBXFrameworksBuildPhase section */",
)

# App frameworks - add WidgetKit
text = text.replace(
    """		504EC3011FED79650016851F /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
				4D22ABE92AF431CB00220026 /* CapApp-SPM in Frameworks */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
""",
    """		504EC3011FED79650016851F /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
				4D22ABE92AF431CB00220026 /* CapApp-SPM in Frameworks */,
				DHRCWBF11 /* WidgetKit.framework in Frameworks */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		DHRCWFW01 /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
				DHRCWBF0E /* WidgetKit.framework in Frameworks */,
				DHRCWBF0F /* SwiftUI.framework in Frameworks */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
""",
)

# Groups
text = text.replace(
    """		504EC2FB1FED79650016851F = {
			isa = PBXGroup;
			children = (
				958DCC722DB07C7200EA8C5F /* debug.xcconfig */,
				504EC3061FED79650016851F /* App */,
				504EC3051FED79650016851F /* Products */,
			);
			sourceTree = "<group>";
		};
		504EC3051FED79650016851F /* Products */ = {
			isa = PBXGroup;
			children = (
				504EC3041FED79650016851F /* App.app */,
			);
			name = Products;
			sourceTree = "<group>";
		};
		504EC3061FED79650016851F /* App */ = {
			isa = PBXGroup;
			children = (
				F5B88A062FAA70BF005C500C /* App.entitlements */,
				50379B222058CBB4000EE86E /* capacitor.config.json */,
				504EC3071FED79650016851F /* AppDelegate.swift */,
				B1C2D3E4F5061728394A5B6C /* SceneDelegate.swift */,
				504EC30B1FED79650016851F /* Main.storyboard */,
				504EC30E1FED79650016851F /* Assets.xcassets */,
				7A8E9F131FED79650016852C /* LaunchLogo */,
				504EC3101FED79650016851F /* LaunchScreen.storyboard */,
				504EC3131FED79650016851F /* Info.plist */,
				2FAD9762203C412B000D30F8 /* config.xml */,
				50B271D01FEDC1A000F3C39B /* public */,
			);
			path = App;
			sourceTree = "<group>";
		};
""",
    """		504EC2FB1FED79650016851F = {
			isa = PBXGroup;
			children = (
				958DCC722DB07C7200EA8C5F /* debug.xcconfig */,
				504EC3061FED79650016851F /* App */,
				DHRCWGR01 /* Shared */,
				DHRCWGR02 /* ReleaseCountdownWidget */,
				504EC3051FED79650016851F /* Products */,
			);
			sourceTree = "<group>";
		};
		504EC3051FED79650016851F /* Products */ = {
			isa = PBXGroup;
			children = (
				504EC3041FED79650016851F /* App.app */,
				DHRCWFR0D /* ReleaseCountdownWidget.appex */,
			);
			name = Products;
			sourceTree = "<group>";
		};
		504EC3061FED79650016851F /* App */ = {
			isa = PBXGroup;
			children = (
				F5B88A062FAA70BF005C500C /* App.entitlements */,
				50379B222058CBB4000EE86E /* capacitor.config.json */,
				504EC3071FED79650016851F /* AppDelegate.swift */,
				B1C2D3E4F5061728394A5B6C /* SceneDelegate.swift */,
				DHRCWFR01 /* HomeWidgetBridgePlugin.swift */,
				504EC30B1FED79650016851F /* Main.storyboard */,
				504EC30E1FED79650016851F /* Assets.xcassets */,
				7A8E9F131FED79650016852C /* LaunchLogo */,
				504EC3101FED79650016851F /* LaunchScreen.storyboard */,
				504EC3131FED79650016851F /* Info.plist */,
				2FAD9762203C412B000D30F8 /* config.xml */,
				50B271D01FEDC1A000F3C39B /* public */,
			);
			path = App;
			sourceTree = "<group>";
		};
		DHRCWGR01 /* Shared */ = {
			isa = PBXGroup;
			children = (
				DHRCWFR02 /* HomeWidgetAppGroup.swift */,
				DHRCWFR03 /* HomeWidgetPayloadModels.swift */,
				DHRCWFR04 /* HomeWidgetUtcCountdown.swift */,
			);
			path = Shared;
			sourceTree = "<group>";
		};
		DHRCWGR02 /* ReleaseCountdownWidget */ = {
			isa = PBXGroup;
			children = (
				DHRCWFR0F /* ReleaseCountdownWidget.entitlements */,
				DHRCWFR0E /* Info.plist */,
				DHRCWFR05 /* ReleaseCountdownWidgetBundle.swift */,
				DHRCWFR06 /* ReleaseCountdownWidget.swift */,
				DHRCWFR07 /* ReleaseCountdownEntry.swift */,
				DHRCWFR08 /* ReleaseCountdownProvider.swift */,
				DHRCWFR09 /* ReleaseCountdownViews.swift */,
				DHRCWFR0A /* Assets.xcassets */,
			);
			path = ReleaseCountdownWidget;
			sourceTree = "<group>";
		};
		DHRCWGR03 /* Frameworks */ = {
			isa = PBXGroup;
			children = (
				DHRCWFR0B /* WidgetKit.framework */,
				DHRCWFR0C /* SwiftUI.framework */,
			);
			name = Frameworks;
			sourceTree = "<group>";
		};
""",
)

# Also add Frameworks group to root children - optional, already referenced via file refs

# Native targets
text = text.replace(
    """		504EC3031FED79650016851F /* App */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 504EC3161FED79650016851F /* Build configuration list for PBXNativeTarget "App" */;
			buildPhases = (
				504EC3001FED79650016851F /* Sources */,
				504EC3011FED79650016851F /* Frameworks */,
				504EC3021FED79650016851F /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = App;
			packageProductDependencies = (
				4D22ABE82AF431CB00220026 /* CapApp-SPM */,
			);
			productName = App;
			productReference = 504EC3041FED79650016851F /* App.app */;
			productType = "com.apple.product-type.application";
		};
/* End PBXNativeTarget section */
""",
    """		504EC3031FED79650016851F /* App */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 504EC3161FED79650016851F /* Build configuration list for PBXNativeTarget "App" */;
			buildPhases = (
				504EC3001FED79650016851F /* Sources */,
				504EC3011FED79650016851F /* Frameworks */,
				504EC3021FED79650016851F /* Resources */,
				DHRCWCP01 /* Embed Foundation Extensions */,
			);
			buildRules = (
			);
			dependencies = (
				DHRCWTD01 /* PBXTargetDependency */,
			);
			name = App;
			packageProductDependencies = (
				4D22ABE82AF431CB00220026 /* CapApp-SPM */,
			);
			productName = App;
			productReference = 504EC3041FED79650016851F /* App.app */;
			productType = "com.apple.product-type.application";
		};
		DHRCWNT01 /* ReleaseCountdownWidget */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = DHRCWCL01 /* Build configuration list for PBXNativeTarget "ReleaseCountdownWidget" */;
			buildPhases = (
				DHRCWSR01 /* Sources */,
				DHRCWFW01 /* Frameworks */,
				DHRCWRS01 /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = ReleaseCountdownWidget;
			productName = ReleaseCountdownWidget;
			productReference = DHRCWFR0D /* ReleaseCountdownWidget.appex */;
			productType = "com.apple.product-type.app-extension";
		};
/* End PBXNativeTarget section */
""",
)

# Project attributes + targets
text = text.replace(
    """			attributes = {
				LastSwiftUpdateCheck = 0920;
				LastUpgradeCheck = 0920;
				TargetAttributes = {
					504EC3031FED79650016851F = {
						CreatedOnToolsVersion = 9.2;
						LastSwiftMigration = 1100;
						ProvisioningStyle = Automatic;
					};
				};
			};
""",
    """			attributes = {
				LastSwiftUpdateCheck = 1500;
				LastUpgradeCheck = 0920;
				TargetAttributes = {
					504EC3031FED79650016851F = {
						CreatedOnToolsVersion = 9.2;
						LastSwiftMigration = 1100;
						ProvisioningStyle = Automatic;
					};
					DHRCWNT01 = {
						CreatedOnToolsVersion = 15.0;
						ProvisioningStyle = Automatic;
					};
				};
			};
""",
)

text = text.replace(
    """			targets = (
				504EC3031FED79650016851F /* App */,
			);
""",
    """			targets = (
				504EC3031FED79650016851F /* App */,
				DHRCWNT01 /* ReleaseCountdownWidget */,
			);
""",
)

# Resources for widget
text = text.replace(
    "/* End PBXResourcesBuildPhase section */",
    """		DHRCWRS01 /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				DHRCWBF0D /* Assets.xcassets in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXResourcesBuildPhase section */
""",
)

# Sources
text = text.replace(
    """		504EC3001FED79650016851F /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				504EC3081FED79650016851F /* AppDelegate.swift in Sources */,
				A1B2C3D4E5F60718293A4B5C /* SceneDelegate.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */
""",
    """		504EC3001FED79650016851F /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				504EC3081FED79650016851F /* AppDelegate.swift in Sources */,
				A1B2C3D4E5F60718293A4B5C /* SceneDelegate.swift in Sources */,
				DHRCWBF01 /* HomeWidgetBridgePlugin.swift in Sources */,
				DHRCWBF02 /* HomeWidgetAppGroup.swift in Sources */,
				DHRCWBF03 /* HomeWidgetPayloadModels.swift in Sources */,
				DHRCWBF04 /* HomeWidgetUtcCountdown.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		DHRCWSR01 /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				DHRCWBF08 /* ReleaseCountdownWidgetBundle.swift in Sources */,
				DHRCWBF09 /* ReleaseCountdownWidget.swift in Sources */,
				DHRCWBF0A /* ReleaseCountdownEntry.swift in Sources */,
				DHRCWBF0B /* ReleaseCountdownProvider.swift in Sources */,
				DHRCWBF0C /* ReleaseCountdownViews.swift in Sources */,
				DHRCWBF05 /* HomeWidgetAppGroup.swift in Sources */,
				DHRCWBF06 /* HomeWidgetPayloadModels.swift in Sources */,
				DHRCWBF07 /* HomeWidgetUtcCountdown.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */
""",
)

# Target dependency
text = text.replace(
    "/* Begin PBXVariantGroup section */",
    """/* Begin PBXTargetDependency section */
		DHRCWTD01 /* PBXTargetDependency */ = {
			isa = PBXTargetDependency;
			target = DHRCWNT01 /* ReleaseCountdownWidget */;
			targetProxy = DHRCWIP01 /* PBXContainerItemProxy */;
		};
/* End PBXTargetDependency section */

/* Begin PBXVariantGroup section */
""",
)

# Build configs for widget
text = text.replace(
    "/* End XCBuildConfiguration section */",
    """		DHRCWBC01 /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_ENTITLEMENTS = ReleaseCountdownWidget/ReleaseCountdownWidget.entitlements;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 9;
				DEVELOPMENT_TEAM = SYWKN9QAQ2;
				GENERATE_INFOPLIST_FILE = NO;
				INFOPLIST_FILE = ReleaseCountdownWidget/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
					"@executable_path/../../Frameworks",
				);
				MARKETING_VERSION = 1.5;
				PRODUCT_BUNDLE_IDENTIFIER = uk.dubhub.app.ReleaseCountdownWidget;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SKIP_INSTALL = YES;
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			};
			name = Debug;
		};
		DHRCWBC02 /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_ENTITLEMENTS = ReleaseCountdownWidget/ReleaseCountdownWidget.entitlements;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 9;
				DEVELOPMENT_TEAM = SYWKN9QAQ2;
				GENERATE_INFOPLIST_FILE = NO;
				INFOPLIST_FILE = ReleaseCountdownWidget/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
					"@executable_path/../../Frameworks",
				);
				MARKETING_VERSION = 1.5;
				PRODUCT_BUNDLE_IDENTIFIER = uk.dubhub.app.ReleaseCountdownWidget;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SKIP_INSTALL = YES;
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			};
			name = Release;
		};
/* End XCBuildConfiguration section */
""",
)

text = text.replace(
    "/* End XCConfigurationList section */",
    """		DHRCWCL01 /* Build configuration list for PBXNativeTarget "ReleaseCountdownWidget" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				DHRCWBC01 /* Debug */,
				DHRCWBC02 /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
/* End XCConfigurationList section */
""",
)

PBX.write_text(text)
print("Patched", PBX)
