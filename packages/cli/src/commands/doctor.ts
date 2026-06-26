import path from "node:path";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { CliArgs, CliError, CliDiagnostic, printDiagnostic } from "../utils/cli.js";
import { listFilesRecursive, pathExists } from "../utils/fs.js";
import { getDependencyVersion, hasDependency, readPackageJson } from "../utils/package-json.js";
import { discoverTools, inferChatbotRoot } from "../utils/tools.js";

const serverOnlyImports = [
  "@rsainth/chatdock-sdk",
  "@rsainth/chatdock-sdk/server",
  "@rsainth/chatdock-sdk/next",
  "@rsainth/chatdock-sdk/supabase",
  "@rsainth/server",
  "@rsainth/next",
  "@rsainth/supabase",
];

const frontendSecretMarkers = [
  "service_role",
  "SUPABASE_SERVICE_ROLE",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
];

export async function doctorCommand(args: CliArgs) {
  const diagnostics: CliDiagnostic[] = [];
  const chatbotRoot = await inferChatbotRoot(args.cwd, args);

  const packageJson = await readPackageJson(args.cwd);
  if (!packageJson) {
    diagnostics.push({ severity: "error", message: "package.json was not found." });
  } else {
    for (const dependency of ["ai", "react"]) {
      if (!hasDependency(packageJson, dependency)) {
        diagnostics.push({ severity: "warn", message: `Dependency "${dependency}" was not found.` });
      }
    }

    const hasAllInOnePackage = hasDependency(packageJson, "@rsainth/chatdock-sdk");
    if (!hasAllInOnePackage && !hasDependency(packageJson, "@ai-sdk/react")) {
      diagnostics.push({
        severity: "warn",
        message: 'Dependency "@ai-sdk/react" was not found. It is required for the React package.',
      });
    }

    diagnostics.push(...validateDependencyVersions(packageJson));
  }

  if (!(await pathExists(path.join(args.cwd, chatbotRoot, "system-prompt.ts")))) {
    diagnostics.push({
      severity: "warn",
      message: `${toPosix(path.join(chatbotRoot, "system-prompt.ts"))} was not found. Run chatdock-sdk init or create it manually.`,
    });
  }

  const toolResult = await discoverTools(args.cwd, { chatbotRoot });
  diagnostics.push({
    severity: "info",
    message: `Found ${toolResult.tools.length} generated tool candidate${toolResult.tools.length === 1 ? "" : "s"}.`,
  });
  diagnostics.push(...toolResult.errors.map((message) => ({ severity: "error" as const, message })));
  diagnostics.push(...toolResult.warnings.map((message) => ({ severity: "warn" as const, message })));
  diagnostics.push(...(await findUnsafeToolDefinitions(args.cwd, chatbotRoot)));

  const generatedPath = path.join(args.cwd, chatbotRoot, "tools.generated.ts");
  if (!(await pathExists(generatedPath))) {
    diagnostics.push({
      severity: "warn",
      message: `${toPosix(path.join(chatbotRoot, "tools.generated.ts"))} was not found. Run chatdock-sdk sync-tools.`,
    });
  }

  diagnostics.push(...(await findUnsafeHistoryRoutes(args.cwd)));
  diagnostics.push(...(await findRiskyFrontendImports(args.cwd)));
  diagnostics.push(...(await findInMemoryPersistenceUsage(args.cwd)));
  diagnostics.push(...(await findUnsafeChatRoutes(args.cwd)));

  const projectTypes = await detectProjectTypes(args.cwd);
  diagnostics.push({
    severity: "info",
    message: `Detected project type: ${projectTypes.length > 0 ? projectTypes.join(", ") : "unknown"}.`,
  });

  let hasErrors = false;
  for (const diagnostic of diagnostics) {
    printDiagnostic(diagnostic);
    if (diagnostic.severity === "error") {
      hasErrors = true;
    }
  }

  if (hasErrors) {
    throw new CliError("doctor failed because critical issues were found.");
  }
}

function validateDependencyVersions(packageJson: NonNullable<Awaited<ReturnType<typeof readPackageJson>>>) {
  const diagnostics: CliDiagnostic[] = [];
  const expectedMajors: Record<string, number> = {
    ai: 6,
    "@ai-sdk/react": 3,
  };

  for (const [dependency, major] of Object.entries(expectedMajors)) {
    const version = getDependencyVersion(packageJson, dependency);
    if (!version) {
      continue;
    }

    const actual = readFirstMajor(version);
    if (actual != null && actual !== major) {
      diagnostics.push({
        severity: "warn",
        message: `Dependency "${dependency}" should target major ${major}; found "${version}".`,
      });
    }
  }

  const reactVersion = getDependencyVersion(packageJson, "react");
  const reactMajor = reactVersion ? readFirstMajor(reactVersion) : undefined;
  if (reactMajor != null && reactMajor < 18) {
    diagnostics.push({
      severity: "warn",
      message: `Dependency "react" should target React 18 or newer; found "${reactVersion}".`,
    });
  }

  const providerDependencies = [
    "@ai-sdk/openai",
    "@ai-sdk/google",
    "@ai-sdk/anthropic",
    "@ai-sdk/gateway",
  ];
  if (!providerDependencies.some((dependency) => hasDependency(packageJson, dependency))) {
    diagnostics.push({
      severity: "warn",
      message: `No AI SDK provider dependency was found. Install one of ${providerDependencies.map((dependency) => `"${dependency}"`).join(", ")} or provide a compatible model another way.`,
    });
  }

  return diagnostics;
}

function readFirstMajor(range: string): number | undefined {
  const match = range.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function toPosix(filePath: string) {
  return filePath.split(path.sep).join("/");
}

async function detectProjectTypes(cwd: string) {
  const detected: string[] = [];

  if (await pathExists(path.join(cwd, "next.config.js"))) detected.push("Next.js");
  if (await pathExists(path.join(cwd, "next.config.mjs"))) detected.push("Next.js");
  if (await pathExists(path.join(cwd, "next.config.ts"))) detected.push("Next.js");
  if (await pathExists(path.join(cwd, "vite.config.js"))) detected.push("Vite");
  if (await pathExists(path.join(cwd, "vite.config.ts"))) detected.push("Vite");
  if (await pathExists(path.join(cwd, "supabase", "functions"))) detected.push("Supabase Edge Functions");

  return [...new Set(detected)];
}

async function findRiskyFrontendImports(cwd: string) {
  const sourceRoots = ["src", "app", "pages", "components"].map((root) => path.join(cwd, root));
  const warnings: CliDiagnostic[] = [];
  const sourceFiles = (
    await Promise.all(sourceRoots.map((root) => listFilesRecursive(root)))
  )
    .flat()
    .filter((filePath) => /\.(tsx?|jsx?)$/.test(filePath));

  for (const filePath of sourceFiles) {
    const normalized = filePath.split(path.sep).join("/");
    if (normalized.includes("/app/api/")) {
      continue;
    }

    const isFrontendFile =
      normalized.includes("/components/") ||
      normalized.endsWith(".tsx") ||
      normalized.includes("/app/") ||
      normalized.includes("/pages/");

    if (!isFrontendFile) {
      continue;
    }

    const sourceText = await readFile(filePath, "utf8");
    const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const moduleSpecifier of findModuleSpecifiers(source)) {
      for (const risky of serverOnlyImports) {
        if (moduleSpecifier === risky) {
          warnings.push({
            severity: "error",
            message: `${path.relative(cwd, filePath)} references server-only module "${risky}". Move that import to a server-only module.`,
          });
        }
      }
    }

    for (const marker of frontendSecretMarkers) {
      if (sourceText.includes(marker)) {
        warnings.push({
          severity: "error",
          message: `${path.relative(cwd, filePath)} references server-only secret marker "${marker}". Move secrets and service-role keys to server-only modules.`,
        });
      }
    }
  }

  return warnings;
}

async function findInMemoryPersistenceUsage(cwd: string) {
  const warnings: CliDiagnostic[] = [];
  const appRoots = ["app", path.join("src", "app")].map((root) => path.join(cwd, root));
  const appFiles = (
    await Promise.all(appRoots.map((root) => listFilesRecursive(root)))
  )
    .flat()
    .filter((filePath) => /\.(tsx?|jsx?)$/.test(filePath));

  for (const filePath of appFiles) {
    const source = await readFile(filePath, "utf8");
    if (!source.includes("createInMemoryPersistence")) {
      continue;
    }

    warnings.push({
      severity: "warn",
      message: `${path.relative(cwd, filePath)} uses createInMemoryPersistence. Keep in-memory persistence for demos and tests; use durable persistence in production.`,
    });
  }

  return warnings;
}

async function findUnsafeToolDefinitions(cwd: string, chatbotRoot: string) {
  const toolsRoot = path.join(cwd, chatbotRoot, "tools");
  const warnings: CliDiagnostic[] = [];
  const files = (await listFilesRecursive(toolsRoot))
    .filter((filePath) => filePath.endsWith(`${path.sep}index.ts`))
    .sort((left, right) => left.localeCompare(right));

  for (const filePath of files) {
    const source = await readSourceFile(filePath);
    const toolDefinition = findDefaultToolDefinition(source);
    if (!toolDefinition) {
      continue;
    }

    const hasDangerousFlag =
      hasBooleanProperty(toolDefinition, "destructive", true) ||
      hasBooleanProperty(toolDefinition, "dangerous", true) ||
      hasBooleanProperty(toolDefinition, "requiresConfirmation", true);
    if (hasDangerousFlag && !hasProperty(toolDefinition, "authorize")) {
      warnings.push({
        severity: "error",
        message: `${relative(cwd, filePath)} marks a tool as destructive, dangerous or confirmation-gated but does not define "authorize". Add an authorizer such as allowRoles, allowTenant or requireHumanApproval.`,
      });
    }
  }

  return warnings;
}

async function findUnsafeChatRoutes(cwd: string) {
  const warnings: CliDiagnostic[] = [];
  const routePaths = [
    path.join(cwd, "app", "api", "chat", "route.ts"),
    path.join(cwd, "src", "app", "api", "chat", "route.ts"),
  ];

  for (const routePath of routePaths) {
    if (!(await pathExists(routePath))) {
      continue;
    }

    const source = await readSourceFile(routePath);
    for (const config of findChatHandlerConfigs(source)) {
      const relativePath = relative(cwd, routePath);
      if (!hasBooleanProperty(config, "requireAuth", true)) {
        warnings.push({
          severity: "warn",
          message: `${relativePath} uses createNextChatbotRoute/createSupabaseChatbotHandler without "requireAuth: true". Require auth or isolate this route from private tools and data.`,
        });
      }
      if (hasBooleanProperty(config, "requireAuth", true) && !hasAnyProperty(config, ["authAdapter", "auth"])) {
        warnings.push({
          severity: "warn",
          message: `${relativePath} sets requireAuth: true without an obvious auth or authAdapter. Add authAdapter/auth so the route can actually authenticate.`,
        });
      }
      if (!hasAnyProperty(config, ["model", "models", "fallbackModel"])) {
        warnings.push({
          severity: "warn",
          message: `${relativePath} does not define model, models or fallbackModel. Add one so the handler has an AI model to call.`,
        });
      }
      if (!hasProperty(config, "rateLimitAdapter")) {
        warnings.push({
          severity: "warn",
          message: `${relativePath} uses createNextChatbotRoute/createSupabaseChatbotHandler without an apparent "rateLimitAdapter". Add rate limiting for chat requests.`,
        });
      }
    }
  }

  return warnings;
}

async function findUnsafeHistoryRoutes(cwd: string) {
  const warnings: CliDiagnostic[] = [];
  const routePaths = [
    path.join(cwd, "app", "api", "chat-history", "[[...conversationId]]", "route.ts"),
    path.join(cwd, "src", "app", "api", "chat-history", "[[...conversationId]]", "route.ts"),
  ];

  for (const routePath of routePaths) {
    if (!(await pathExists(routePath))) {
      continue;
    }

    const source = await readSourceFile(routePath);
    for (const config of findConversationHistoryHandlerConfigs(source)) {
      const relativePath = relative(cwd, routePath);
      if (!hasProperty(config, "authAdapter")) {
        warnings.push({
          severity: "error",
          message: `${relativePath} uses createConversationHistoryHandler without an "authAdapter". Add auth so conversation history cannot be listed or modified anonymously.`,
        });
      }

      if (!hasProperty(config, "persistence")) {
        warnings.push({
          severity: "error",
          message: `${relativePath} uses createConversationHistoryHandler without "persistence". Attach a persistence adapter before shipping history.`,
        });
      }
    }
  }

  return warnings;
}

async function readSourceFile(filePath: string) {
  const sourceText = await readFile(filePath, "utf8");
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function findDefaultToolDefinition(source: ts.SourceFile) {
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) {
      return unwrapObjectArgument(statement.expression);
    }
  }

  return undefined;
}

function findChatHandlerConfigs(source: ts.SourceFile) {
  const configs: ts.ObjectLiteralExpression[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      isIdentifierNamed(node.expression, ["createNextChatbotRoute", "createSupabaseChatbotHandler", "createChatbotHandler"])
    ) {
      const firstArgument = node.arguments[0];
      if (firstArgument && ts.isObjectLiteralExpression(firstArgument)) {
        configs.push(firstArgument);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return configs;
}

function findConversationHistoryHandlerConfigs(source: ts.SourceFile) {
  const configs: ts.ObjectLiteralExpression[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isIdentifierNamed(node.expression, ["createConversationHistoryHandler"])) {
      const firstArgument = node.arguments[0];
      if (firstArgument && ts.isObjectLiteralExpression(firstArgument)) {
        configs.push(firstArgument);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return configs;
}

function unwrapObjectArgument(expression: ts.Expression): ts.ObjectLiteralExpression | undefined {
  if (ts.isObjectLiteralExpression(expression)) {
    return expression;
  }

  if (ts.isCallExpression(expression)) {
    const firstArgument = expression.arguments[0];
    if (firstArgument && ts.isObjectLiteralExpression(firstArgument)) {
      return firstArgument;
    }
  }

  return undefined;
}

function hasProperty(objectLiteral: ts.ObjectLiteralExpression, propertyName: string) {
  return objectLiteral.properties.some((property) => propertyNameOf(property.name) === propertyName);
}

function hasAnyProperty(objectLiteral: ts.ObjectLiteralExpression, propertyNames: string[]) {
  return propertyNames.some((propertyName) => hasProperty(objectLiteral, propertyName));
}

function hasBooleanProperty(objectLiteral: ts.ObjectLiteralExpression, propertyName: string, value: boolean) {
  const property = objectLiteral.properties.find((candidate) => propertyNameOf(candidate.name) === propertyName);
  if (!property || !ts.isPropertyAssignment(property)) {
    return false;
  }

  return property.initializer.kind === (value ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword);
}

function propertyNameOf(name: ts.PropertyName | undefined) {
  if (!name) {
    return undefined;
  }

  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function isIdentifierNamed(expression: ts.Expression, names: string[]) {
  return ts.isIdentifier(expression) && names.includes(expression.text);
}

function findModuleSpecifiers(source: ts.SourceFile) {
  const specifiers: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier)) {
        specifiers.push(moduleSpecifier.text);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length > 0
    ) {
      const firstArgument = node.arguments[0];
      if (ts.isStringLiteralLike(firstArgument)) {
        specifiers.push(firstArgument.text);
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const firstArgument = node.arguments[0];
      if (firstArgument && ts.isStringLiteralLike(firstArgument)) {
        specifiers.push(firstArgument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return specifiers;
}

function relative(cwd: string, filePath: string) {
  return path.relative(cwd, filePath).split(path.sep).join("/");
}
