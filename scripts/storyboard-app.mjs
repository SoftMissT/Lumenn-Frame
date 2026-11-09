import {
	LumennGraphStore
} from "./graph-store.mjs";
import {
	LumennTransitionController
} from "./transition-controller.mjs";
import {
	LumennCompat
} from "./foundry-compat.mjs";
import {
	LumennSettings
} from "./settings.mjs";
import {
	formatEdgeLabel
} from "./edge-label.mjs";
import {
	clampGraphZoom,
	directionalRectAnchor,
	GRAPH_ZOOM_STEP,
	wheelPanDelta
} from "./graph-viewport.mjs";
import {
	childrenOf,
	effectiveEndpoint,
	GROUP_PADDING,
	groupBounds,
	groupOpenFor,
	movePositions,
	parentMap
} from "./graph-groups.mjs";
const {
	ApplicationV2,
	HandlebarsApplicationMixin
} = foundry.applications.api;
const {
	DragDrop
} = foundry.applications.ux;
const ZOOM_STEP = GRAPH_ZOOM_STEP;
const NODE_SIZES = {
	scene: {
		compact: [230, 160],
		normal: [320, 215],
		large: [400, 260]
	},
	audio: {
		compact: [210, 130],
		normal: [285, 165],
		large: [360, 205]
	},
	note: {
		compact: [200, 130],
		normal: [260, 170],
		large: [340, 220]
	},
	group: {
		compact: [280, 180],
		normal: [360, 240],
		large: [460, 300]
	}
};
const COLORS = ["#f0a321", "#2dd4bf", "#e45656", "#7aa2f7", "#bb9af7", "#9ece6a", "#73707c", "#ffffff"];
const SIZES = ["compact", "normal", "large"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function normalizeHexColor(value, fallback = "#000000") {
	const raw = String(value ?? "").trim();
	if (HEX_COLOR.test(raw)) return raw;
	if (/^#[0-9a-f]{3}$/i.test(raw)) {
		return `#${[...raw.slice(1)].map(c=>`${c}${c}`).join("")}`
	}
	return HEX_COLOR.test(fallback) ? fallback : "#000000"
}

function nodeSize(type, size) {
	return NODE_SIZES[type]?.[size] ?? NODE_SIZES[type]?.normal ?? [260, 175]
}

function fadeOverlay() {
	let el = document.getElementById("lumenn-fade");
	if (!el) {
		el = document.createElement("div");
		el.id = "lumenn-fade";
		el.style.cssText = "position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:99999;transition:opacity .01s linear;";
		document.body.appendChild(el)
	}
	return el
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function lumennClientSceneFade(sceneId, sceneTrans = {}) {
	const type = sceneTrans?.type ?? "fade";
	const scene = sceneId ? game.scenes.get(sceneId) : null;
	if (!LumennCompat.isGM() && LumennCompat.hasNativeSceneTransitions() && (type === "cut" || LumennCompat.hasSceneTransition(type))) return "native";
	const nativeResult = await LumennCompat.runSceneTransition({
		scene,
		type,
		duration: sceneTrans?.duration ?? 1e3,
		color: normalizeHexColor(sceneTrans?.color, "#000000"),
		activate: false
	});
	if (nativeResult === "native" || nativeResult === "cut") return nativeResult;
	const el = fadeOverlay();
	const duration = sceneTrans?.duration ?? 500;
	if (duration <= 0) return;
	el.style.transition = `opacity ${duration}ms ease`;
	el.style.opacity = "1";
	await sleep(duration);
	if (sceneId) {
		if (LumennCompat.isGM()) await LumennCompat.activateScene(scene, undefined, {
			suppressScenePlaylist: true
		});
		else if (scene?.view) await scene.view()
	}
	await sleep(40);
	el.style.opacity = "0";
	await sleep(duration)
}
export class LumennGraphApp extends(HandlebarsApplicationMixin(ApplicationV2)) {
	#controller = new LumennTransitionController;
	#graphId = null;
	#mode = "edit";
	#tool = "select";
	#collapsedGroups = new Set();
	#lockedGroups = new Set();
	#groupDragOverrides = null;
	#camera = {
		panX: 0,
		panY: 0,
		zoom: 1
	};
	#panState = null;
	#spaceDown = false;
	#resizeObserver = null;
	#dragDrop;
	#selected = {
		kind: null,
		id: null
	};
	#connectState = null;
	#edgeFrame = null;
	#pendingEdgeNodes = new Map;
	#edgeGraphSnapshot = null;
	#expanded = false;
	#prevPosition = null;
	#transitioning = false;
	#previewing = false;
	#suppressClick = false;
	#suppressNodeClick = false;
	static DEFAULT_OPTIONS = {
		id: "lumenn-storyboard",
		classes: ["lumenn-frame", "graph-editor", "app", "window-app"],
		title: "Lumenn Frame",
		tag: "div",
		position: {
			width: 1440,
			height: 900
		},
		window: {
			resizable: true
		},
		dragDrop: [{
			dropSelector: ".lf-viewport"
		}]
	};
	static PARTS = {
		main: {
			template: "modules/lumenn-frame/templates/storyboard.hbs"
		}
	};
	constructor(options = {}) {
		super(options);
		this.#dragDrop = this.#createDragDropHandlers();
		this.#camera.zoom = clampGraphZoom(LumennSettings.getCameraDefaults().zoom);
		document.addEventListener("keydown", e => {
			if (e.key === "Escape") {
				if (this.#previewing) {
					canvas.transition?.cancel?.();
					e.preventDefault();
					return
				}
				if (this.#connectState) {
					this.#connectState = null;
					this.#updateGhost()
				}
				if (this.#selected.kind) {
					this.#selected = {
						kind: null,
						id: null
					};
					this.render()
				}
			}
			if (e.code === "Space") {
				const t = e.target;
				if (t && (t.matches?.("input, textarea, select") || t.isContentEditable)) return;
				if (!this.#spaceDown) {
					this.#spaceDown = true;
					this.element?.classList.add("space-hold")
				}
				e.preventDefault()
			}
		});
		document.addEventListener("keyup", e => {
			if (e.code === "Space") {
				this.#spaceDown = false;
				this.element?.classList.remove("space-hold")
			}
		})
	}
	#editable() {
		return this.#mode === "edit" && LumennCompat.isGM()
	}
	#canEditLiveAudio() {
		if (this.#mode !== "live" || !LumennCompat.isGM()) return false;
		if (this.#selected.kind !== "edge") return false;
		const edge = LumennGraphStore.getEdge(this.#graphId, this.#selected.id);
		return edge?.type === "flow" || edge?.type === "audio"
	}
	#canEditInspectorPath(path) {
		if (typeof path !== "string" || !path) return false;
		if (this.#editable()) return true;
		return this.#canEditLiveAudio() && (path === "transition.scope" || path.startsWith("transition.audio."))
	}
	#createDragDropHandlers() {
		return this.options.dragDrop.map(d => {
			d.permissions = {
				drop: () => this.#editable()
			};
			d.callbacks = {
				dragover: this.#onDragOver.bind(this),
				dragleave: this.#onDragLeave.bind(this),
				drop: this.#onDrop.bind(this)
			};
			return new DragDrop(d)
		})
	}
	#onDragOver(e) {
		e.preventDefault();
		this.element.querySelector(".lf-viewport")?.classList.add("drag-over")
	}
	#onDragLeave() {
		this.element.querySelector(".lf-viewport")?.classList.remove("drag-over")
	}
	async #onDrop(event) {
		event.preventDefault();
		this.element.querySelector(".lf-viewport")?.classList.remove("drag-over");
		if (!this.#editable()) return;
		const data = LumennCompat.getDragData(event);
		const doc = await LumennCompat.resolveUuid(data?.uuid);
		if (!doc) return;
		const viewport = this.element.querySelector(".lf-viewport");
		const point = this.#clientToCanvas(event, viewport);
		const dropNode = event.target?.closest?.(".lf-node");
		if (dropNode?.dataset?.id) return this.#attachDrop(dropNode.dataset.id, doc);
		const items = this.#resolveDropItems(doc);
		if (!items.length) return;
		const graph = LumennGraphStore.getGraph(this.#graphId);
		const imp = LumennSettings.getImportDefaults();
		const created = [];
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const [w, h] = nodeSize(item.type, "normal");
			const col = i % imp.columns;
			const row = Math.floor(i / imp.columns);
			const node = {
				id: `node_${foundry.utils.randomID(16)}`,
				type: item.type,
				position: {
					x: Math.round(point.x + col * (w + imp.gap)),
					y: Math.round(point.y + row * (h + imp.gap))
				},
				data: {
					...item.data ?? {}
				}
			};
			const createdNode = await LumennGraphStore.addNode(this.#graphId, node);
			if (createdNode) created.push(createdNode)
		}
		if (created.length && !graph?.activeNodeId) await LumennGraphStore.setActiveNode(this.#graphId, created[0].id);
		if (imp.autoConnect) {
			const scenes = created.filter(n => n.type === "scene");
			for (let i = 0; i < scenes.length - 1; i++) {
				await LumennGraphStore.addEdge(this.#graphId, {
					id: `edge_${foundry.utils.randomID(16)}`,
					type: "flow",
					from: scenes[i].id,
					to: scenes[i + 1].id
				})
			}
		}
		this.#selected = {
			kind: "node",
			id: created[0]?.id ?? null
		};
		this.render()
	}
	#attachDrop(nodeId, doc) {
		const node = LumennGraphStore.getNode(this.#graphId, nodeId);
		if (!node) return;
		if (node.type === "group") {
			ui.notifications.warn(game.i18n.localize("LUMENN_FRAME.Group.DropUnsupported"));
			return
		}
		if (node.type === "scene" && doc.documentName === "Scene") {
			LumennGraphStore.updateNode(this.#graphId, nodeId, {
				data: {
					...node.data,
					sceneId: doc.id
				}
			}).then(() => this.render())
		} else if (node.type === "scene" && ["Playlist", "PlaylistSound"].includes(doc.documentName)) {
			const [w] = nodeSize("audio", "normal");
			LumennGraphStore.addNode(this.#graphId, {
				id: `node_${foundry.utils.randomID(16)}`,
				type: "audio",
				position: {
					x: node.position.x + w + 40,
					y: node.position.y
				},
				data: {
					audioRole: "music",
					audioType: doc.documentName === "Playlist" ? "playlist" : "track",
					audioId: doc.documentName === "Playlist" ? doc.id : doc.uuid,
					volume: .75,
					loop: true,
					fadeIn: null,
					fadeOut: null
				}
			}).then(audioNode => audioNode && LumennGraphStore.addEdge(this.#graphId, {
				id: `edge_${foundry.utils.randomID(16)}`,
				type: "audio",
				from: audioNode.id,
				to: nodeId
			})).then(() => this.render())
		}
	}
	#resolveDropItems(doc) {
		const imp = LumennSettings.getImportDefaults();
		const items = [];
		const audioDefaults = {
			audioRole: "music",
			volume: .75,
			loop: true,
			fadeIn: null,
			fadeOut: null
		};
		const push = (d, rootFolder) => {
			const folder = d.folder ?? rootFolder;
			const meta = {
				sourceFolderId: folder?.id ?? null,
				sourceFolderPath: folder?.path ?? null
			};
			if (d.documentName === "Scene") {
				items.push({
					type: "scene",
					data: {
						sceneId: d.id,
						...meta
					}
				})
			} else if (d.documentName === "Playlist") {
				if (imp.tracksAsNodes) {
					for (const s of d.sounds ?? []) {
						items.push({
							type: "audio",
							data: {
								audioType: "track",
								audioId: s.uuid,
								...audioDefaults,
								...meta
							}
						})
					}
				} else {
					items.push({
						type: "audio",
						data: {
							audioType: "playlist",
							audioId: d.id,
							...audioDefaults,
							...meta
						}
					})
				}
			} else if (d.documentName === "PlaylistSound") {
				items.push({
					type: "audio",
					data: {
						audioType: "track",
						audioId: d.uuid,
						...audioDefaults,
						...meta
					}
				})
			}
		};
		if (doc.documentName === "Folder") {
			const list = imp.recursive && typeof doc.getSubfolders === "function" ? LumennCompat.collectFolderDocuments(doc) : [...doc.contents];
			for (const d of list) push(d, doc)
		} else {
			push(doc, null)
		}
		return items
	}
	#clientToScreen(event, viewport) {
		const r = viewport?.getBoundingClientRect() ?? {
			left: 0,
			top: 0
		};
		return {
			x: event.clientX - r.left,
			y: event.clientY - r.top
		}
	}
	#clientToCanvas(event, viewport) {
		return this.#screenToWorld(this.#clientToScreen(event, viewport))
	}
	#screenToWorld(s) {
		return {
			x: (s.x - this.#camera.panX) / this.#camera.zoom,
			y: (s.y - this.#camera.panY) / this.#camera.zoom
		}
	}
	#worldToScreen(w) {
		return {
			x: w.x * this.#camera.zoom + this.#camera.panX,
			y: w.y * this.#camera.zoom + this.#camera.panY
		}
	}
	#applyCamera(root = this.element) {
		const camEl = root.querySelector(".lf-camera");
		if (camEl) {
			camEl.style.transform = `translate3d(${this.#camera.panX}px, ${this.#camera.panY}px, 0) scale(${this.#camera.zoom})`;
			const zoom = String(this.#camera.zoom);
			if (camEl.dataset.lfZoom !== zoom) {
				camEl.dataset.lfZoom = zoom;
				camEl.style.setProperty("--lf-inv-zoom", String(1 / this.#camera.zoom))
			}
		}
		const pct = root.querySelector("[data-camera-percent]");
		if (pct) pct.textContent = `${Math.round(this.#camera.zoom*100)}%`
	}
	#zoomAt(screenPoint, zoom) {
		const cam = this.#camera;
		const w = this.#screenToWorld(screenPoint);
		zoom = clampGraphZoom(zoom);
		cam.panX = screenPoint.x - w.x * zoom;
		cam.panY = screenPoint.y - w.y * zoom;
		cam.zoom = zoom;
		this.#applyCamera()
	}
	#fitAll(root) {
		const viewport = root.querySelector(".lf-viewport");
		if (!viewport) return;
		const graph = LumennGraphStore.getGraph(this.#graphId);
		const nodes = graph?.nodes ?? [];
		if (!nodes.length) {
			this.#camera.panX = 0;
			this.#camera.panY = 0;
			this.#camera.zoom = 1;
			return this.#applyCamera(root)
		}
		const PAD = 60;
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const n of nodes) {
			const bounds = this.#nodeBounds(n.id, null, graph);
			if (!bounds) continue;
			minX = Math.min(minX, bounds.x);
			minY = Math.min(minY, bounds.y);
			maxX = Math.max(maxX, bounds.x + bounds.width);
			maxY = Math.max(maxY, bounds.y + bounds.height)
		}
		const contentW = Math.max(1, maxX - minX);
		const contentH = Math.max(1, maxY - minY);
		const availW = Math.max(1, viewport.clientWidth - PAD * 2);
		const availH = Math.max(1, viewport.clientHeight - PAD * 2);
		let zoom = Math.min(availW / contentW, availH / contentH);
		zoom = clampGraphZoom(zoom);
		this.#camera.zoom = zoom;
		this.#camera.panX = viewport.clientWidth / 2 - (minX + maxX) / 2 * zoom;
		this.#camera.panY = viewport.clientHeight / 2 - (minY + maxY) / 2 * zoom;
		this.#applyCamera(root)
	}
	#toggleWorkspace(root) {
		if (this.#expanded) {
			if (this.#prevPosition) this.setPosition(this.#prevPosition);
			this.#expanded = false
		} else {
			this.#prevPosition = LumennCompat.expandWorkspace(this);
			this.#expanded = true
		}
		const btn = root.querySelector("[data-action='workspace-toggle']");
		if (btn) btn.textContent = this.#expanded ? game.i18n.localize("LUMENN_FRAME.Workspace.Restore") : game.i18n.localize("LUMENN_FRAME.Workspace.Expand")
	}
	async _prepareContext() {
		if (LumennCompat.isGM() && !LumennGraphStore.getAll().length) {
			await LumennGraphStore.createGraph()
		}
		const graphs = LumennGraphStore.getAll();
		const activeGraph = graphs.find(g => g.id === this.#graphId) ?? graphs[0] ?? null;
		if (activeGraph) this.#graphId = activeGraph.id;
		const L = k => game.i18n.localize(k);
		const navigable = this.#navigableSet(activeGraph);
		const defaultColors = LumennGraphStore.getDefaultColors();
		const allNodes = activeGraph?.nodes ?? [];
		const collapsed = this.#collapsedSet(activeGraph);
		const visible = allNodes.filter(n => !(n.parentId && collapsed.has(n.parentId)));
		visible.sort((a, b) => (a.type === "group" ? 0 : 1) - (b.type === "group" ? 0 : 1));
		const nodes = visible.map(n => {
			const kids = n.type === "group" ? childrenOf(allNodes, n.id) : [];
			const bounds = n.type === "group" ? groupBounds(allNodes, n.id, nodeSize, GROUP_PADDING) : null;
			const [w, h] = bounds ? [bounds.width, bounds.height] : nodeSize(n.type, n.size);
			const position = bounds ? {
				x: bounds.x,
				y: bounds.y
			} : n.position;
			const audioSource = this.#audioSourceOf(n);
			const playable = n.type !== "group" && this.#mode === "live" && LumennCompat.isGM() && !!audioSource;
			const groupActive = kids.some(k => k.id === activeGraph.activeNodeId);
			const groupNavigable = kids.some(k => navigable.has(k.id));
			const out = {
				...n,
				position,
				color: normalizeHexColor(n.color, defaultColors[n.type] ?? "#73707c"),
				width: w,
				height: h,
				isActive: n.type === "group" ? groupActive : n.id === activeGraph.activeNodeId,
				isNavigable: n.type === "group" ? this.#mode === "live" && groupNavigable : this.#mode === "live" && navigable.has(n.id),
				isPlayable: playable,
				isPlaying: n.type !== "group" && !!audioSource && this.#isAudioPlaying(audioSource),
				isDimmed: this.#mode === "live" && LumennSettings.get("dimUnreachable") && !(n.type === "group" ? groupActive || groupNavigable : n.id === activeGraph.activeNodeId || navigable.has(n.id) || playable),
				selected: this.#selected.kind === "node" && this.#selected.id === n.id,
				targetHi: this.#connectState?.targetHi === n.id
			};
			if (n.type === "group") {
				out.groupLabel = n.data?.title || L("LUMENN_FRAME.Group.DefaultName");
				out.groupCount = kids.length;
				out.groupOpen = !collapsed.has(n.id);
				out.groupLocked = this.#lockedGroups.has(n.id)
			} else if (n.type === "scene") {
				const scene = n.data?.sceneId ? game.scenes.get(n.data.sceneId) : null;
				out.sceneName = scene?.name ?? (n.data?.sceneId ? L("LUMENN_FRAME.Beat.InvalidScene") : L("LUMENN_FRAME.Beat.NoScene"));
				out.sceneThumb = scene?.thumbnail ?? scene?.background?.src ?? null
			} else if (n.type === "audio") {
				const label = this.#audioLabel(n.data);
				out.audioLabel = label.name;
				out.audioBadge = label.badge;
				out.audioRole = n.data?.audioRole === "sfx" ? "sfx" : "music";
				out.audioRoleLabel = out.audioRole === "sfx" ? L("LUMENN_FRAME.AudioRole.Sfx") : L("LUMENN_FRAME.AudioRole.Music")
			}
			return out
		});
		const inspector = this.#buildInspector(activeGraph);
		let connectHint = null;
		if (this.#editable() && this.#connectState) {
			connectHint = this.#connectState.port.startsWith("flow") ? L("LUMENN_FRAME.Connect.HintFlowDrag") : L("LUMENN_FRAME.Connect.HintAudioDrag")
		} else if (this.#editable() && this.#tool === "connect") {
			connectHint = L("LUMENN_FRAME.Connect.HintIdle")
		}
		return {
			graphs,
			activeGraph,
			nodes,
			edgeCount: activeGraph?.edges?.length ?? 0,
			mode: this.#mode,
			tool: this.#tool,
			isGM: LumennCompat.isGM(),
			editable: this.#editable(),
			liveAudioEditing: this.#canEditLiveAudio(),
			selectedKind: this.#selected.kind,
			connecting: !!this.#connectState,
			showConnectHint: !!connectHint,
			connectHint,
			transitioning: this.#transitioning,
			showEdgeLabels: LumennSettings.get("showTransitionLabels"),
			inspector,
			navigableIds: [...navigable],
			label: {
				editMode: L("LUMENN_FRAME.Toolbar.EditMode"),
				liveMode: L("LUMENN_FRAME.Toolbar.LiveMode"),
				expand: L("LUMENN_FRAME.Workspace.Expand"),
				restore: L("LUMENN_FRAME.Workspace.Restore"),
				emptyState: L("LUMENN_FRAME.EmptyState"),
				emptyHint: L("LUMENN_FRAME.EmptyHint"),
				dropHint: L("LUMENN_FRAME.DropHint"),
				select: L("LUMENN_FRAME.Tool.Select"),
				hand: L("LUMENN_FRAME.Tool.Hand"),
				connect: L("LUMENN_FRAME.Tool.Connect"),
				addScene: L("LUMENN_FRAME.Tool.AddScene"),
				addAudio: L("LUMENN_FRAME.Tool.AddAudio"),
				addNote: L("LUMENN_FRAME.Tool.AddNote"),
				addGroup: L("LUMENN_FRAME.Tool.AddGroup"),
				graph: L("LUMENN_FRAME.Inspector.Graph"),
				scene: L("LUMENN_FRAME.Inspector.Scene"),
				audio: L("LUMENN_FRAME.Inspector.Audio"),
				audioNodes: L("LUMENN_FRAME.Inspector.AudioNodes"),
				focusNode: L("LUMENN_FRAME.Inspector.FocusNode"),
				audioRole: L("LUMENN_FRAME.AudioRole.Label"),
				musicRole: L("LUMENN_FRAME.AudioRole.Music"),
				sfxRole: L("LUMENN_FRAME.AudioRole.Sfx"),
				activeState: L("LUMENN_FRAME.Legend.Active"),
				navigableState: L("LUMENN_FRAME.Legend.Navigable"),
				selectedState: L("LUMENN_FRAME.Legend.Selected"),
				targetState: L("LUMENN_FRAME.Legend.Target"),
				note: L("LUMENN_FRAME.Inspector.Note"),
				group: L("LUMENN_FRAME.Inspector.Group"),
				groupRooms: L("LUMENN_FRAME.Group.Rooms"),
				groupCreate: L("LUMENN_FRAME.Inspector.GroupCreate"),
				groupAdd: L("LUMENN_FRAME.Inspector.GroupAdd"),
				groupRemove: L("LUMENN_FRAME.Inspector.GroupRemove"),
				groupApplyRooms: L("LUMENN_FRAME.Inspector.GroupApplyRooms"),
				groupUngroup: L("LUMENN_FRAME.Inspector.GroupUngroup"),
				groupLock: L("LUMENN_FRAME.Group.Lock"),
				groupUnlock: L("LUMENN_FRAME.Group.Unlock"),
				groupToggle: L("LUMENN_FRAME.Group.Toggle"),
				flowEdge: L("LUMENN_FRAME.Inspector.FlowEdge"),
				audioEdge: L("LUMENN_FRAME.Inspector.AudioEdge"),
				audioRoutingNote: L("LUMENN_FRAME.Inspector.AudioRoutingNote"),
				none: L("LUMENN_FRAME.Config.None"),
				save: L("LUMENN_FRAME.Config.Save"),
				delete: L("LUMENN_FRAME.Beat.Delete"),
				setInitial: L("LUMENN_FRAME.Beat.SetStart"),
				addReturn: L("LUMENN_FRAME.Edge.AddReturn"),
				bidirectional: L("LUMENN_FRAME.Edge.Bidirectional"),
				color: L("LUMENN_FRAME.Inspector.Color"),
				size: L("LUMENN_FRAME.Inspector.Size"),
				notes: L("LUMENN_FRAME.Inspector.Notes"),
				name: L("LUMENN_FRAME.Inspector.Name"),
				sceneTrans: L("LUMENN_FRAME.Inspector.SceneTransition"),
				audioTrans: L("LUMENN_FRAME.Inspector.AudioTransition"),
				cut: L("LUMENN_FRAME.Edge.Cut"),
				fade: L("LUMENN_FRAME.Edge.Fade"),
				duration: L("LUMENN_FRAME.Inspector.Duration"),
				audioMode: L("LUMENN_FRAME.Inspector.AudioMode"),
				auto: L("LUMENN_FRAME.Edge.Auto"),
				keep: L("LUMENN_FRAME.Edge.Keep"),
				crossfade: L("LUMENN_FRAME.Edge.Crossfade"),
				fadeout: L("LUMENN_FRAME.Edge.FadeOut"),
				fadein: L("LUMENN_FRAME.Edge.FadeIn"),
				crossfadeDur: L("LUMENN_FRAME.Inspector.CrossfadeDur"),
				volume: L("LUMENN_FRAME.Inspector.Volume"),
				loop: L("LUMENN_FRAME.Inspector.Loop"),
				title: L("LUMENN_FRAME.Inspector.Title"),
				body: L("LUMENN_FRAME.Inspector.Body"),
				source: L("LUMENN_FRAME.Inspector.Source"),
				sceneDoc: L("LUMENN_FRAME.Config.Scene"),
				createGraph: L("LUMENN_FRAME.Toolbar.CreateStoryboard"),
				renameGraph: L("LUMENN_FRAME.Toolbar.RenameStoryboard"),
				deleteGraph: L("LUMENN_FRAME.Toolbar.DeleteStoryboard"),
				sortGraphs: L("LUMENN_FRAME.Toolbar.SortStoryboards"),
				liveAudioEditing: L("LUMENN_FRAME.Inspector.LiveAudioEditing"),
				transition: L("LUMENN_FRAME.Transitioning"),
				from: L("LUMENN_FRAME.Edge.From"),
				to: L("LUMENN_FRAME.Edge.To"),
				fadeIn: L("LUMENN_FRAME.Inspector.FadeIn"),
				fadeOut: L("LUMENN_FRAME.Inspector.FadeOut"),
				connections: L("LUMENN_FRAME.Inspector.Connections"),
				outgoing: L("LUMENN_FRAME.Inspector.Outgoing"),
				incoming: L("LUMENN_FRAME.Inspector.Incoming"),
				addDestination: L("LUMENN_FRAME.Inspector.AddDestination"),
				attachAudio: L("LUMENN_FRAME.Inspector.AttachAudio"),
				noScenes: L("LUMENN_FRAME.Inspector.NoScenes"),
				noAudioNodes: L("LUMENN_FRAME.Inspector.NoAudioNodes"),
				editTransition: L("LUMENN_FRAME.Edge.EditTransition"),
				transitionScope: L("LUMENN_FRAME.Inspector.TransitionScope"),
				audioOnly: L("LUMENN_FRAME.Inspector.AudioOnly"),
				sceneOnly: L("LUMENN_FRAME.Inspector.SceneOnly"),
				beatBoth: L("LUMENN_FRAME.Inspector.BeatBoth")
			}
		}
	}
	#audioLabel(src) {
		if (!src?.audioType) return {
			name: game.i18n.localize("LUMENN_FRAME.Beat.NoAudio"),
			badge: ""
		};
		if (src.audioType === "playlist") {
			const p = game.playlists.get(src.audioId);
			return {
				name: p?.name ?? game.i18n.localize("LUMENN_FRAME.Beat.InvalidAudio"),
				badge: "PLAYLIST"
			}
		}
		for (const p of game.playlists ?? []) {
			const s = p.sounds?.get(src.audioId);
			if (s) return {
				name: s.name,
				badge: "TRACK"
			}
		}
		const byUuid = LumennCompat.resolveUuidSync(src.audioId);
		return {
			name: byUuid?.name ?? game.i18n.localize("LUMENN_FRAME.Beat.InvalidAudio"),
			badge: "TRACK"
		}
	}
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.#dragDrop.forEach(d => d.bind(this.element));
		const root = this.element;
		root.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", e => this.#action(e)));
		root.querySelectorAll("[data-group-toggle]").forEach(el => el.addEventListener("click", e => {
			e.preventDefault();
			e.stopPropagation();
			const groupId = e.currentTarget.dataset.groupToggle;
			if (!groupId) return;
			if (this.#collapsedGroups.has(groupId)) this.#collapsedGroups.delete(groupId);
			else {
				this.#collapsedGroups.add(groupId);
				const selected = this.#selected.kind === "node" ? LumennGraphStore.getNode(this.#graphId, this.#selected.id) : null;
				if (selected?.parentId === groupId) this.#selected = {
					kind: null,
					id: null
				}
			}
			this.render()
		}));
		root.querySelectorAll("[data-group-lock]").forEach(el => el.addEventListener("click", e => {
			e.preventDefault();
			e.stopPropagation();
			const groupId = e.currentTarget.dataset.groupLock;
			if (!groupId) return;
			if (this.#lockedGroups.has(groupId)) this.#lockedGroups.delete(groupId);
			else this.#lockedGroups.add(groupId);
			this.render()
		}));
		root.querySelectorAll("[data-tool]").forEach(el => el.addEventListener("click", e => {
			const tool = e.currentTarget.dataset.tool;
			this.#tool = tool;
			this.#selected = {
				kind: null,
				id: null
			};
			this.render()
		}));
		const selector = root.querySelector("select[data-graph-selector]");
		selector?.addEventListener("change", e => {
			this.#graphId = e.target.value;
			this.#collapsedGroups.clear();
			this.#lockedGroups.clear();
			this.#selected = {
				kind: null,
				id: null
			};
			this.render()
		});
		root.querySelectorAll(".lf-node").forEach(node => this.#bindNode(root, node));
		root.querySelectorAll("[data-port]").forEach(port => port.addEventListener("pointerdown", e => this.#startConnect(e, port)));
		root.querySelectorAll("[data-insp]").forEach(el => el.addEventListener("change", e => this.#inspectorChange(e)));
		root.querySelectorAll("[data-insp-input]").forEach(el => el.addEventListener("input", e => this.#inspectorInput(e)));
		root.querySelectorAll("[data-insp-action]").forEach(el => el.addEventListener("click", e => this.#inspectorAction(e)));
		root.querySelectorAll("[data-insp-swatch]").forEach(el => el.addEventListener("click", e => this.#inspectorSwatch(e)));
		this.#resizeWorld(root);
		this.#drawEdges(root);
		this.#applyCamera(root);
		this.#bindCamera(root);
		this.#observeResize(root);
		root.querySelector(".lf-viewport")?.classList.toggle("connect-mode", this.#tool === "connect");
		root.querySelector(".lf-viewport")?.addEventListener("click", e => this.#viewportClick(e));
		root.querySelectorAll(".lf-node").forEach(node => node.addEventListener("click", e => this.#nodeClick(e)));
		root.querySelector(".lf-edges")?.addEventListener("click", e => this.#edgeClick(e));
		root.classList.toggle("editing", this.#mode === "edit");
		if (!this._workspaceAuto && LumennSettings.get("openInWorkspace") && !this.#expanded) {
			this._workspaceAuto = true;
			this.#toggleWorkspace(root)
		}
	}
	#bindNode(root, node) {
		if (!this.#editable()) return;
		node.addEventListener("dragstart", event => event.preventDefault());
		node.addEventListener("pointerdown", e => {
			if (e.target.closest("button") || e.target.closest("[data-port]")) return;
			if (this.#spaceDown || e.button !== 0) return;
			if (this.#tool === "hand") return;
			e.preventDefault();
			e.stopPropagation();
			this.#suppressNodeClick = false;
			this.#selected = {
				kind: "node",
				id: node.dataset.id
			};
			root.querySelectorAll(".lf-node.selected").forEach(el => el.classList.remove("selected"));
			node.classList.add("selected");
			node.setPointerCapture(e.pointerId);
			const viewport = root.querySelector(".lf-viewport");
			const viewportRect = viewport.getBoundingClientRect();
			const graphSnapshot = LumennGraphStore.getGraph(this.#graphId);
			const beat = graphSnapshot?.nodes?.find(candidate => candidate.id === node.dataset.id);
			const isGroup = beat?.type === "group";
			const groupChildren = isGroup ? childrenOf(graphSnapshot?.nodes ?? [], beat.id) : [];
			const base = isGroup ? {
				x: node.offsetLeft,
				y: node.offsetTop
			} : beat?.position ?? {
				x: 0,
				y: 0
			};
			const pointerToWorld = event => this.#screenToWorld({
				x: event.clientX - viewportRect.left,
				y: event.clientY - viewportRect.top
			});
			const w0 = pointerToWorld(e);
			const grab = {
				x: w0.x - base.x,
				y: w0.y - base.y
			};
			let next = {
				...base
			};
			let moved = false;
			node.classList.add("dragging");
			const move = ev => {
				ev.preventDefault();
				ev.stopPropagation();
				const w = pointerToWorld(ev);
				next = {
					x: Math.round(w.x - grab.x),
					y: Math.round(w.y - grab.y)
				};
				const dx = next.x - base.x;
				const dy = next.y - base.y;
				if (!moved && Math.hypot(dx, dy) >= 3) moved = true;
				node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
				if (isGroup) {
					const overrides = new Map;
					for (const child of groupChildren) {
						const position = {
							x: Math.round((child.position?.x ?? 0) + dx),
							y: Math.round((child.position?.y ?? 0) + dy)
						};
						overrides.set(child.id, position);
						this.#pendingEdgeNodes.set(child.id, position);
						const element = root.querySelector(`.lf-node[data-id="${child.id}"]`);
						if (element) {
							element.style.left = `${position.x}px`;
							element.style.top = `${position.y}px`
						}
					}
					this.#groupDragOverrides = overrides;
					this.#edgeGraphSnapshot = graphSnapshot;
					this.#scheduleEdgeDraw(root);
					return
				}
				this.#scheduleEdgeDraw(root, node.dataset.id, next, graphSnapshot)
			};
			const up = async ev => {
				ev.preventDefault();
				ev.stopPropagation();
				if (node.hasPointerCapture?.(ev.pointerId)) node.releasePointerCapture(ev.pointerId);
				node.removeEventListener("pointermove", move);
				node.removeEventListener("pointerup", up);
				node.removeEventListener("pointercancel", up);
				node.classList.remove("dragging");
				node.style.transform = "";
				if (!isGroup) {
					node.style.left = `${next.x}px`;
					node.style.top = `${next.y}px`
				}
				this.#suppressNodeClick = moved;
				if (this.#edgeFrame !== null) cancelAnimationFrame(this.#edgeFrame);
				this.#edgeFrame = null;
				this.#pendingEdgeNodes.clear();
				this.#edgeGraphSnapshot = null;
				if (isGroup) {
					const patches = movePositions(groupChildren, {
						x: next.x - base.x,
						y: next.y - base.y
					});
					patches.unshift({
						id: beat.id,
						position: {
							x: next.x,
							y: next.y
						}
					});
					this.#groupDragOverrides = null;
					const updated = await LumennGraphStore.updateNodes(this.#graphId, patches);
					node.style.transform = "";
					if (!updated.length) {
						this.render();
						return
					}
					this.#resizeWorld(root);
					this.render();
					return
				}
				this.#updateIncidentEdges(root, graphSnapshot, new Map([
					[node.dataset.id, next]
				]));
				const updated = await LumennGraphStore.updateNode(this.#graphId, node.dataset.id, {
					position: next
				});
				if (!updated) {
					node.style.left = `${base.x}px`;
					node.style.top = `${base.y}px`;
					this.#drawEdges(root);
					return
				}
				this.#resizeWorld(root);
				if (beat?.parentId) this.render()
			};
			node.addEventListener("pointermove", move);
			node.addEventListener("pointerup", up, {
				once: true
			});
			node.addEventListener("pointercancel", up, {
				once: true
			})
		})
	}
	#nodeClick(e) {
		const nodeEl = e.target.closest?.(".lf-node");
		if (!nodeEl) return;
		if (e.target.closest("button") || e.target.closest("[data-port]")) return;
		if (this.#suppressNodeClick) {
			this.#suppressNodeClick = false;
			e.preventDefault();
			e.stopPropagation();
			return
		}
		if (this.#mode === "live") {
			const id = nodeEl.dataset.id;
			if (id && this.#isNavigable(id)) this.#navigateTo(id);
			else if (id && nodeEl.classList.contains("playable")) this.#playAudioNode(id);
			return
		}
		if (this.#tool === "connect") return;
		this.#selected = {
			kind: "node",
			id: nodeEl.dataset.id
		};
		this.render()
	}
	#edgeClick(e) {
		const hit = e.target.closest?.(".lf-edge-hit");
		if (!hit?.dataset?.edgeId) return;
		if (this.#mode === "live") {
			if (!LumennCompat.isGM()) return;
			const edge = LumennGraphStore.getEdge(this.#graphId, hit.dataset.edgeId);
			if (!edge) return;
			e.preventDefault();
			e.stopPropagation();
			this.#selected = {
				kind: "edge",
				id: edge.id
			};
			this.render();
			return
		}
		e.preventDefault();
		e.stopPropagation();
		this.#selected = {
			kind: "edge",
			id: hit.dataset.edgeId
		};
		this.render()
	}
	#viewportClick(e) {
		if (this.#suppressClick) {
			this.#suppressClick = false;
			return
		}
		if (e.target.closest(".lf-node") || e.target.closest("[data-port]") || e.target.closest(".lf-edge-hit") || e.target.closest(".lf-camera-bar")) return;
		if (this.#spaceDown) return;
		if (!this.#editable()) return;
		if (this.#tool === "scene" || this.#tool === "audio" || this.#tool === "note" || this.#tool === "group") {
			const point = this.#clientToCanvas(e, this.element.querySelector(".lf-viewport"));
			this.#createNodeAt(this.#tool, point);
			return
		}
		if (this.#selected.kind) {
			this.#selected = {
				kind: null,
				id: null
			};
			this.render()
		}
	}
	async #createNodeAt(type, point) {
		const [w, h] = nodeSize(type, "normal");
		const node = {
			id: `node_${foundry.utils.randomID(16)}`,
			type,
			position: {
				x: Math.round(point.x - w / 2),
				y: Math.round(point.y - h / 2)
			},
			data: type === "scene" ? {
				sceneId: null
			} : type === "audio" ? {
				audioRole: "music",
				audioType: null,
				audioId: null,
				volume: .75,
				loop: true,
				fadeIn: null,
				fadeOut: null
			} : type === "group" ? {
				title: game.i18n.localize("LUMENN_FRAME.Group.DefaultName")
			} : {
				title: "",
				body: ""
			}
		};
		const created = await LumennGraphStore.addNode(this.#graphId, node);
		if (created) {
			this.#selected = {
				kind: "node",
				id: created.id
			};
			this.render()
		}
	}
	#isNavigable(id) {
		const graph = LumennGraphStore.getGraph(this.#graphId);
		return !!graph?.edges?.some(e => (e.type === "flow" || e.type === "audio") && e.from === graph.activeNodeId && e.to === id)
	}
	#bindCamera(root) {
		const viewport = root.querySelector(".lf-viewport");
		if (!viewport) return;
		viewport.addEventListener("wheel", e => {
			e.preventDefault();
			if (e.ctrlKey || e.metaKey) {
				const s = LumennSettings.get("zoomSpeed") / 100;
				const factor = Math.pow(1 + s, -e.deltaY * .01);
				this.#zoomAt(this.#clientToScreen(e, viewport), this.#camera.zoom * factor);
				return
			}
			const delta = wheelPanDelta(e, viewport.clientHeight);
			this.#camera.panX -= delta.x;
			this.#camera.panY -= delta.y;
			this.#applyCamera(root)
		}, {
			passive: false
		});
		viewport.addEventListener("pointerdown", e => {
			const isPan = this.#spaceDown && e.button === 0 || e.button === 1;
			if (!isPan) return;
			e.preventDefault();
			this.#suppressClick = true;
			viewport.setPointerCapture(e.pointerId);
			this.#panState = {
				id: e.pointerId,
				x: e.clientX,
				y: e.clientY
			};
			viewport.classList.add("panning")
		});
		viewport.addEventListener("pointermove", e => {
			if (!this.#panState || this.#panState.id !== e.pointerId) return;
			this.#camera.panX += e.clientX - this.#panState.x;
			this.#camera.panY += e.clientY - this.#panState.y;
			this.#panState.x = e.clientX;
			this.#panState.y = e.clientY;
			this.#applyCamera(root)
		});
		const endPan = e => {
			if (this.#panState?.id === e.pointerId) {
				this.#panState = null;
				viewport.classList.remove("panning")
			}
		};
		viewport.addEventListener("pointerup", endPan);
		viewport.addEventListener("pointercancel", endPan);
		root.querySelectorAll("[data-camera]").forEach(btn => btn.addEventListener("click", e => {
			const act = e.currentTarget.dataset.camera;
			const center = {
				x: viewport.clientWidth / 2,
				y: viewport.clientHeight / 2
			};
			if (act === "zoom-in") this.#zoomAt(center, this.#camera.zoom * ZOOM_STEP);
			else if (act === "zoom-out") this.#zoomAt(center, this.#camera.zoom / ZOOM_STEP);
			else if (act === "reset") this.#zoomAt(center, 1);
			else if (act === "fit") this.#fitAll(root)
		}))
	}
	#observeResize(root) {
		const viewport = root.querySelector(".lf-viewport");
		if (!viewport) return;
		this.#resizeObserver?.disconnect();
		this.#resizeObserver = new ResizeObserver(() => {
			this.#resizeWorld(root);
			this.#drawEdges(root)
		});
		this.#resizeObserver.observe(viewport)
	}
	#resizeWorld(root) {
		const viewport = root.querySelector(".lf-viewport");
		const world = root.querySelector(".lf-camera");
		if (!viewport || !world) return;
		const graph = LumennGraphStore.getGraph(this.#graphId);
		let maxX = viewport.clientWidth,
			maxY = viewport.clientHeight;
		for (const n of graph?.nodes ?? []) {
			const bounds = this.#nodeBounds(n.id, null, graph);
			if (!bounds) continue;
			maxX = Math.max(maxX, bounds.x + bounds.width + 400);
			maxY = Math.max(maxY, bounds.y + bounds.height + 400)
		}
		world.style.width = `${maxX}px`;
		world.style.height = `${maxY}px`
	}
	#nodeBounds(nodeId, positionOverride = null, graph = null) {
		const source = graph ?? LumennGraphStore.getGraph(this.#graphId);
		const node = source?.nodes?.find(candidate => candidate.id === nodeId) ?? LumennGraphStore.getNode(this.#graphId, nodeId);
		if (!node) return null;
		if (node.type === "group") {
			const bounds = groupBounds(source?.nodes ?? [], node.id, nodeSize, GROUP_PADDING, child => this.#groupDragOverrides?.get(child.id) ?? child.position);
			if (bounds) return bounds
		}
		const [w, h] = nodeSize(node.type, node.size);
		const p = positionOverride ?? node.position;
		return {
			x: p.x,
			y: p.y,
			width: w,
			height: h
		}
	}
	#navigableSet(graph) {
		const set = new Set;
		if (this.#mode === "live" && graph?.activeNodeId) {
			for (const edge of graph.edges ?? []) {
				if ((edge.type === "flow" || edge.type === "audio") && edge.from === graph.activeNodeId) set.add(edge.to)
			}
		}
		return set
	}
	#isGroupOpen(groupId, graph) {
		if (this.#mode === "edit") return !this.#collapsedGroups.has(groupId);
		return groupOpenFor(groupId, graph?.nodes ?? [], graph?.activeNodeId ?? null, this.#navigableSet(graph), this.#lockedGroups)
	}
	#collapsedSet(graph) {
		const set = new Set;
		for (const node of graph?.nodes ?? []) {
			if (node.type === "group" && !this.#isGroupOpen(node.id, graph)) set.add(node.id)
		}
		return set
	}
	#effectiveEdgeIds(edge, graph, collapsed = null) {
		const closed = collapsed ?? this.#collapsedSet(graph);
		const parents = parentMap(graph?.nodes ?? []);
		return {
			from: effectiveEndpoint(edge.from, parents, closed),
			to: effectiveEndpoint(edge.to, parents, closed)
		}
	}
	#portAnchor(nodeId, port, positionOverride = null, graph = null) {
		const bounds = this.#nodeBounds(nodeId, positionOverride, graph);
		if (!bounds) return {
			x: 0,
			y: 0
		};
		const {
			x,
			y,
			width: w,
			height: h
		} = bounds;
		if (port === "flow-out") return {
			x: x + w,
			y: y + h * .3
		};
		if (port === "flow-in") return {
			x,
			y: y + h * .3
		};
		if (port === "audio-out") return {
			x: x + w,
			y: y + h * .62
		};
		return {
			x,
			y: y + h * .62
		}
	}
	#edgeGeometry(edge, graph, positionOverrides = null, collapsed = null) {
		const fromPosition = positionOverrides?.get(edge.from) ?? null;
		const toPosition = positionOverrides?.get(edge.to) ?? null;
		const ids = this.#effectiveEdgeIds(edge, graph, collapsed);
		const fromBounds = this.#nodeBounds(ids.from, fromPosition, graph);
		const toBounds = this.#nodeBounds(ids.to, toPosition, graph);
		if (!fromBounds || !toBounds) return {
			d: "",
			midX: 0,
			midY: 0,
			nx: 0,
			ny: 0,
			start: {
				x: 0,
				y: 0
			},
			end: {
				x: 0,
				y: 0
			}
		};
		const fromCenter = {
			x: fromBounds.x + fromBounds.width / 2,
			y: fromBounds.y + fromBounds.height / 2
		};
		const toCenter = {
			x: toBounds.x + toBounds.width / 2,
			y: toBounds.y + toBounds.height / 2
		};
		const a = directionalRectAnchor(fromBounds, toCenter, "right");
		const b = directionalRectAnchor(toBounds, fromCenter, "left");
		const hasReverse = edge.type === "flow" && graph.edges.some(candidate => candidate.type === "flow" && candidate.from === edge.to && candidate.to === edge.from);
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const length = Math.max(1, Math.hypot(dx, dy));
		const nx = -dy / length;
		const ny = dx / length;
		const bend = edge.type === "flow" && hasReverse ? edge.from < edge.to ? 54 : -54 : edge.type === "audio" ? 18 : 0;
		const c1x = a.x + dx * .33 + nx * bend;
		const c1y = a.y + dy * .33 + ny * bend;
		const c2x = a.x + dx * .66 + nx * bend;
		const c2y = a.y + dy * .66 + ny * bend;
		return {
			d: `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`,
			midX: (a.x + b.x) / 2 + nx * bend,
			midY: (a.y + b.y) / 2 + ny * bend,
			nx,
			ny,
			start: a,
			end: b
		}
	}
	#drawEdges(root) {
		if (this.#edgeFrame !== null) cancelAnimationFrame(this.#edgeFrame);
		this.#edgeFrame = null;
		this.#pendingEdgeNodes.clear();
		this.#edgeGraphSnapshot = null;
		const svg = root.querySelector(".lf-edges");
		const graph = LumennGraphStore.getGraph(this.#graphId);
		if (!svg) return;
		svg.innerHTML = "";
		const collapsed = this.#collapsedSet(graph);
		for (const e of graph?.edges ?? []) {
			const from = graph.nodes.find(node => node.id === e.from);
			const to = graph.nodes.find(node => node.id === e.to);
			if (!from || !to) continue;
			const ids = this.#effectiveEdgeIds(e, graph, collapsed);
			if (ids.from === ids.to) continue;
			const {
				d,
				midX,
				midY,
				nx,
				ny,
				start: edgeStart,
				end: edgeEnd
			} = this.#edgeGeometry(e, graph, null, collapsed);
			if (e.type === "audio") {
				const role = from.data?.audioRole === "sfx" ? "sfx" : "music";
				const rolePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
				rolePath.setAttribute("d", d);
				rolePath.setAttribute("fill", "none");
				rolePath.setAttribute("class", `lf-edge-audio-role lf-edge-audio-role-${role}`);
				rolePath.setAttribute("data-edge-id", e.id);
				rolePath.setAttribute("vector-effect", "non-scaling-stroke");
				svg.appendChild(rolePath)
			}
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", d);
			path.setAttribute("fill", "none");
			path.setAttribute("class", `lf-edge lf-edge-${e.type}`);
			path.setAttribute("data-edge-id", e.id);
			path.setAttribute("vector-effect", "non-scaling-stroke");
			const selected = this.#selected.kind === "edge" && this.#selected.id === e.id;
			if (e.type === "flow") {
				if (selected) path.style.stroke = "#ffffff";
				else {
					const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
					const gradientId = `lf-flow-${e.id}`;
					gradient.setAttribute("id", gradientId);
					gradient.setAttribute("x1", "0%");
					gradient.setAttribute("x2", "100%");
					gradient.setAttribute("y1", "0%");
					gradient.setAttribute("y2", "0%");
					const start = document.createElementNS("http://www.w3.org/2000/svg", "stop");
					start.setAttribute("offset", "0%");
					const fromActive = ids.from === graph.activeNodeId || childrenOf(graph.nodes, ids.from).some(kid => kid.id === graph.activeNodeId);
					start.setAttribute("stop-color", fromActive ? "#ffd166" : "#f0a321");
					const end = document.createElementNS("http://www.w3.org/2000/svg", "stop");
					end.setAttribute("offset", "100%");
					end.setAttribute("stop-color", "#8b6a28");
					gradient.append(start, end);
					const defs = svg.querySelector("defs") ?? document.createElementNS("http://www.w3.org/2000/svg", "defs");
					if (!defs.parentNode) svg.prepend(defs);
					defs.appendChild(gradient);
					path.style.stroke = `url(#${gradientId})`
				}
				path.setAttribute("stroke-width", selected ? 4 : 3);
				path.setAttribute("opacity", selected ? 1 : .8)
			} else {
				path.style.stroke = selected ? "#ff7b7b" : "#ef4444";
				path.setAttribute("stroke-width", selected ? 3.2 : 2.4);
				path.setAttribute("opacity", selected ? 1 : .9);
				path.setAttribute("transform", `translate(${nx*2.5} ${ny*2.5})`);
				const left = path.cloneNode(true);
				left.classList.add("lf-edge-audio-left");
				left.style.stroke = "#ffffff";
				left.setAttribute("transform", `translate(${-nx*2.5} ${-ny*2.5})`);
				svg.appendChild(left)
			}
			svg.appendChild(path);
			for (const [edgeEndName, point] of [
					["start", edgeStart],
					["end", edgeEnd]
				]) {
				const dock = document.createElementNS("http://www.w3.org/2000/svg", "circle");
				dock.setAttribute("cx", point.x);
				dock.setAttribute("cy", point.y);
				dock.setAttribute("r", e.type === "flow" ? 3.5 : 3);
				dock.setAttribute("class", `lf-edge-dock lf-edge-dock-${e.type}`);
				dock.setAttribute("data-edge-id", e.id);
				dock.setAttribute("data-edge-end", edgeEndName);
				dock.setAttribute("vector-effect", "non-scaling-stroke");
				svg.appendChild(dock)
			}
			if (e.type === "flow" && LumennSettings.get("showTransitionLabels") && this.#camera.zoom >= .45) {
				const label = this.#edgeLabelText(e);
				if (label) {
					const lx = midX;
					const ly = midY - 6;
					const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
					text.setAttribute("x", lx);
					text.setAttribute("y", ly);
					text.setAttribute("text-anchor", "middle");
					text.setAttribute("font-size", "11");
					text.setAttribute("font-family", "var(--lf-font-body)");
					text.style.fill = "var(--lf-text)";
					text.style.stroke = "#101014";
					text.setAttribute("stroke-width", "3");
					text.setAttribute("stroke-linejoin", "round");
					text.setAttribute("paint-order", "stroke");
					text.setAttribute("class", "lf-edge-label");
					text.setAttribute("data-edge-id", e.id);
					text.textContent = label;
					svg.appendChild(text)
				}
			}
			const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
			hit.setAttribute("d", d);
			hit.setAttribute("fill", "none");
			hit.setAttribute("stroke", "transparent");
			hit.setAttribute("stroke-width", "24");
			hit.setAttribute("class", "lf-edge-hit");
			hit.setAttribute("data-edge-id", e.id);
			hit.setAttribute("vector-effect", "non-scaling-stroke");
			hit.setAttribute("title", `${this.#nodeLabel(from)} ? ${this.#nodeLabel(to)} ${game.i18n.localize("LUMENN_FRAME.Edge.EditTransition")}`);
			svg.appendChild(hit)
		}
		const ghost = document.createElementNS("http://www.w3.org/2000/svg", "path");
		ghost.setAttribute("class", "lf-ghost");
		ghost.setAttribute("fill", "none");
		ghost.setAttribute("stroke", "var(--lf-teal)");
		ghost.setAttribute("stroke-width", "2");
		ghost.setAttribute("stroke-dasharray", "6 4");
		ghost.setAttribute("d", this.#connectState ? this.#ghostPath() : "");
		svg.appendChild(ghost)
	}
	#updateIncidentEdges(root, graph, positionOverrides) {
		const svg = root.querySelector(".lf-edges");
		if (!svg || !graph) return;
		const dirtyNodes = new Set(positionOverrides.keys());
		const collapsed = this.#collapsedSet(graph);
		for (const edge of graph.edges ?? []) {
			if (!dirtyNodes.has(edge.from) && !dirtyNodes.has(edge.to)) continue;
			const ids = this.#effectiveEdgeIds(edge, graph, collapsed);
			if (ids.from === ids.to) continue;
			const geometry = this.#edgeGeometry(edge, graph, positionOverrides, collapsed);
			const elements = svg.querySelectorAll(`[data-edge-id="${edge.id}"]`);
			for (const element of elements) {
				if (element.tagName.toLowerCase() === "text") {
					element.setAttribute("x", geometry.midX);
					element.setAttribute("y", geometry.midY - 6);
					continue
				}
				if (element.tagName.toLowerCase() === "circle") {
					const point = element.dataset.edgeEnd === "start" ? geometry.start : geometry.end;
					element.setAttribute("cx", point.x);
					element.setAttribute("cy", point.y);
					continue
				}
				element.setAttribute("d", geometry.d);
				if (edge.type !== "audio" || element.classList.contains("lf-edge-hit") || element.classList.contains("lf-edge-audio-role")) continue;
				const side = element.classList.contains("lf-edge-audio-left") ? -2.5 : 2.5;
				element.setAttribute("transform", `translate(${geometry.nx*side} ${geometry.ny*side})`)
			}
		}
	}
	#scheduleEdgeDraw(root = this.element, nodeId = null, position = null, graphSnapshot = null) {
		if (nodeId && position) this.#pendingEdgeNodes.set(nodeId, position);
		if (graphSnapshot) this.#edgeGraphSnapshot = graphSnapshot;
		if (this.#edgeFrame !== null) return;
		this.#edgeFrame = requestAnimationFrame(() => {
			this.#edgeFrame = null;
			if (!this.#pendingEdgeNodes.size) {
				this.#drawEdges(root);
				return
			}
			const overrides = new Map(this.#pendingEdgeNodes);
			this.#pendingEdgeNodes.clear();
			const graph = this.#edgeGraphSnapshot ?? LumennGraphStore.getGraph(this.#graphId);
			this.#edgeGraphSnapshot = null;
			this.#updateIncidentEdges(root, graph, overrides)
		})
	}
	#ghostPath() {
		if (!this.#connectState) return "";
		const from = this.#portAnchor(this.#connectState.nodeId, this.#connectState.port);
		const viewport = this.element.querySelector(".lf-viewport");
		const to = this.#screenToWorld(this.#clientToScreen({
			clientX: this.#connectState.x,
			clientY: this.#connectState.y
		}, viewport));
		const midX = (from.x + to.x) / 2;
		return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`
	}
	#updateGhost() {
		const svg = this.element.querySelector(".lf-edges");
		const ghost = svg?.querySelector(".lf-ghost");
		if (ghost) ghost.setAttribute("d", this.#ghostPath())
	}
	#edgeLabelText(e) {
		const t = e.transition;
		if (!t) return null;
		const L = k => game.i18n.localize(k);
		const type = t.scene?.type ?? "cut";
		const sceneName = type === "cut" ? L("LUMENN_FRAME.Edge.Cut") : LumennCompat.getSceneTransitions().find(d => d.id === type)?.label ?? type;
		return formatEdgeLabel(t, {
			L,
			sceneName
		})
	}
	#startConnect(e, port) {
		if (!this.#editable() || this.#tool === "hand") return;
		e.preventDefault();
		e.stopPropagation();
		const viewport = this.element.querySelector(".lf-viewport");
		viewport.setPointerCapture(e.pointerId);
		this.#connectState = {
			nodeId: port.dataset.node,
			port: port.dataset.port,
			x: e.clientX,
			y: e.clientY,
			targetNodeId: null,
			targetPort: null
		};
		this.#updateGhost();
		const move = ev => {
			this.#connectState.x = ev.clientX;
			this.#connectState.y = ev.clientY;
			this.#updateGhost();
			this.#highlightTarget(ev)
		};
		const up = ev => {
			viewport.removeEventListener("pointermove", move);
			viewport.removeEventListener("pointerup", up);
			viewport.removeEventListener("pointercancel", up);
			this.#finishConnect(ev)
		};
		viewport.addEventListener("pointermove", move);
		viewport.addEventListener("pointerup", up, {
			once: true
		});
		viewport.addEventListener("pointercancel", up, {
			once: true
		})
	}
	#highlightTarget(ev) {
		const target = this.#findConnectTarget(ev.clientX, ev.clientY);
		const nodeId = target?.nodeId ?? null;
		const port = target?.port ?? null;
		if (this.#connectState.targetNodeId === nodeId) return;
		this.#connectState.targetNodeId = nodeId;
		this.#connectState.targetPort = port;
		const root = this.element;
		root.querySelectorAll(".lf-node.target-hi").forEach(n => n.classList.remove("target-hi"));
		if (nodeId) root.querySelector(`.lf-node[data-id="${nodeId}"]`)?.classList.add("target-hi")
	}
	#findConnectTarget(clientX, clientY, connectState = this.#connectState) {
		const state = connectState;
		if (!state) return null;
		const expected = state.port === "flow-out" ? "flow-in" : "audio-in";
		const direct = document.elementFromPoint(clientX, clientY)?.closest?.(`[data-port="${expected}"]`);
		if (direct?.dataset?.node && direct.dataset.node !== state.nodeId) return {
			nodeId: direct.dataset.node,
			port: expected
		};
		const node = document.elementFromPoint(clientX, clientY)?.closest?.(".lf-node");
		if (node?.dataset?.id && node.dataset.id !== state.nodeId) {
			const port = node.querySelector(`[data-port="${expected}"]`);
			if (port) return {
				nodeId: node.dataset.id,
				port: expected
			}
		}
		let best = null;
		let bestDistance = Infinity;
		this.element.querySelectorAll(`[data-port="${expected}"]`).forEach(candidate => {
			if (candidate.dataset.node === state.nodeId) return;
			const r = candidate.getBoundingClientRect();
			const pad = 30;
			const dx = Math.max(r.left - clientX, 0, clientX - r.right);
			const dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
			const distance = Math.hypot(dx, dy);
			if (distance <= pad && distance < bestDistance) {
				best = {
					nodeId: candidate.dataset.node,
					port: expected
				};
				bestDistance = distance
			}
		});
		return best
	}
	#finishConnect(ev) {
		const viewport = this.element.querySelector(".lf-viewport");
		if (viewport?.hasPointerCapture?.(ev.pointerId)) {
			viewport.releasePointerCapture(ev.pointerId)
		}
		const state = this.#connectState;
		this.#connectState = null;
		this.#updateGhost();
		this.element.querySelectorAll(".lf-node.target-hi").forEach(n => n.classList.remove("target-hi"));
		if (!state) return;
		const hit = this.#findConnectTarget(ev.clientX, ev.clientY, state);
		const toNodeId = state.targetNodeId ?? hit?.nodeId ?? null;
		const toPort = state.targetPort ?? hit?.port ?? null;
		if (!toNodeId || toNodeId === state.nodeId) return;
		const valid = state.port === "flow-out" && toPort === "flow-in" || state.port === "audio-out" && toPort === "audio-in";
		if (!valid) return;
		const edge = {
			id: `edge_${foundry.utils.randomID(16)}`,
			type: state.port === "flow-out" ? "flow" : "audio",
			from: state.nodeId,
			to: toNodeId
		};
		LumennGraphStore.addEdge(this.#graphId, edge).then(created => {
			if (created) {
				this.#selected = {
					kind: "edge",
					id: created.id
				};
				this.render()
			}
		})
	}
	async #action(event) {
		event.preventDefault();
		const action = event.currentTarget.dataset.action;
		const root = this.element;
		if (action === "toggle-mode") {
			this.#mode = this.#mode === "edit" ? "live" : "edit";
			this.#selected = {
				kind: null,
				id: null
			};
			return this.render()
		}
		if (action === "workspace-toggle") return this.#toggleWorkspace(root);
		if (!LumennCompat.isGM() || this.#mode !== "edit") return;
		if (action === "create-graph") {
			const raw = await foundry.applications.api.DialogV2.prompt({
				window: {
					title: game.i18n.localize("LUMENN_FRAME.Toolbar.CreateStoryboard")
				},
				content: `<input type="text" name="name" value="Novo Storyboard" autofocus>`,
				ok: {
					label: game.i18n.localize("LUMENN_FRAME.Config.Save"),
					callback: (ev, btn) => btn.form.elements.name.value
				}
			});
			const name = (typeof raw === "string" ? raw : raw?.name ?? "").toString().trim();
			if (!name) return;
			const g = await LumennGraphStore.createGraph(name);
			this.#graphId = g?.id ?? this.#graphId;
			this.render()
		} else if (action === "sort-graphs") {
			await LumennGraphStore.sortGraphsByName();
			this.render()
		} else if (action === "rename-graph") {
			const graph = LumennGraphStore.getGraph(this.#graphId);
			const raw = await foundry.applications.api.DialogV2.prompt({
				window: {
					title: game.i18n.localize("LUMENN_FRAME.Toolbar.RenameStoryboard")
				},
				content: `<input type="text" name="name" value="${String(graph?.name??"").replace(/"/g,"&quot;")}" autofocus>`,
				ok: {
					label: game.i18n.localize("LUMENN_FRAME.Config.Save"),
					callback: (ev, btn) => btn.form.elements.name.value
				}
			});
			const name = (typeof raw === "string" ? raw : raw?.name ?? "").toString().trim();
			if (name) {
				await LumennGraphStore.renameGraph(this.#graphId, name);
				this.render()
			}
		} else if (action === "delete-graph") {
			const ok = await foundry.applications.api.DialogV2.confirm({
				title: game.i18n.localize("LUMENN_FRAME.Toolbar.DeleteStoryboard"),
				content: game.i18n.localize("LUMENN_FRAME.ConfirmDeleteStoryboard"),
				yes: {
					label: game.i18n.localize("LUMENN_FRAME.Beat.Delete")
				},
				no: {
					label: game.i18n.localize("LUMENN_FRAME.Config.Cancel")
				}
			});
			if (ok) {
				await LumennGraphStore.deleteGraph(this.#graphId);
				this.#graphId = null;
				this.#selected = {
					kind: null,
					id: null
				};
				this.render()
			}
		}
	}
	#setPath(obj, path, val) {
		const parts = path.split(".");
		let cur = obj;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!cur[parts[i]]) cur[parts[i]] = {};
			cur = cur[parts[i]]
		}
		cur[parts[parts.length - 1]] = val
	}
	#mergeEdgePatch(edge, patch) {
		if (!patch.transition) return patch;
		const merged = {
			...patch,
			transition: {
				...edge?.transition ?? {},
				...patch.transition,
				scene: {
					...edge?.transition?.scene ?? {},
					...patch.transition.scene ?? {}
				},
				audio: {
					...edge?.transition?.audio ?? {},
					...patch.transition.audio ?? {}
				}
			}
		};
		merged.transition.scene.color = normalizeHexColor(merged.transition.scene.color, "#000000");
		return merged
	}
	#inspectorChange(e) {
		const path = e.currentTarget.dataset.insp;
		if (!this.#canEditInspectorPath(path)) return;
		if (this.#mode === "live" && path !== "transition.scope" && !path.startsWith("transition.audio.")) return;
		let val = e.currentTarget.type === "checkbox" ? e.currentTarget.checked : e.currentTarget.value;
		if (typeof val === "string" && /Duration|volume|fadeIn|fadeOut|duration/.test(path)) val = Number.isFinite(Number(val)) ? Number(val) : null;
		if (typeof val === "number" && /Duration|duration|fadeIn|fadeOut/.test(path)) val = Math.max(0, Math.min(1e4, val));
		if (typeof val === "number" && path.endsWith("volume")) val = Math.max(0, Math.min(1, val));
		const kind = this.#selected.kind;
		const id = this.#selected.id;
		if (!path || !kind || !id) return;
		if (path.endsWith(".color")) {
			val = normalizeHexColor(val, "#000000");
			e.currentTarget.value = val
		}
		if (kind === "node") {
			const node = LumennGraphStore.getNode(this.#graphId, id);
			const patch = {};
			this.#setPath(patch, path, val);
			LumennGraphStore.updateNode(this.#graphId, id, {
				...patch,
				data: {
					...node.data,
					...patch.data ?? {}
				}
			}).then(() => this.render())
		} else if (kind === "edge") {
			const edge = LumennGraphStore.getEdge(this.#graphId, id);
			const patch = {};
			this.#setPath(patch, path, val);
			LumennGraphStore.updateEdge(this.#graphId, id, this.#mergeEdgePatch(edge, patch)).then(() => {
				const graph = LumennGraphStore.getGraph(this.#graphId);
				const edge = graph?.edges?.find(candidate => candidate.id === id);
				if (!edge) return;
				const label = this.element.querySelector(`.lf-edge-label[data-edge-id="${id}"]`);
				if (label) label.textContent = this.#edgeLabelText(edge) ?? ""
			})
		}
	}
	#inspectorInput(e) {
		clearTimeout(this._inspTimer);
		const path = e.currentTarget.dataset.inspInput;
		const val = e.currentTarget.value;
		const kind = this.#selected.kind;
		const id = this.#selected.id;
		this._inspTimer = setTimeout(() => {
			if (!path || !kind || !id || !this.#canEditInspectorPath(path)) return;
			if (this.#mode === "live" && !path.startsWith("transition.audio.")) return;
			if (kind === "node") {
				const node = LumennGraphStore.getNode(this.#graphId, id);
				const patch = {};
				this.#setPath(patch, path, val);
				LumennGraphStore.updateNode(this.#graphId, id, {
					...patch,
					data: {
						...node.data,
						...patch.data ?? {}
					}
				}).then(() => this.render())
			} else if (kind === "edge") {
				const edge = LumennGraphStore.getEdge(this.#graphId, id);
				const patch = {};
				this.#setPath(patch, path, val);
				LumennGraphStore.updateEdge(this.#graphId, id, this.#mergeEdgePatch(edge, patch)).then(() => this.render())
			}
		}, 300)
	}
	async #inspectorAction(e) {
		const action = e.currentTarget.dataset.inspAction;
		const root = this.element;
		if (action === "select-edge") {
			const edgeId = e.currentTarget.dataset.inspEdge;
			if (!edgeId) return;
			this.#selected = {
				kind: "edge",
				id: edgeId
			};
			this.render();
			return
		}
		if (!this.#editable()) return;
		if (action === "focus-node") {
			const nodeId = e.currentTarget.dataset.inspNode;
			const node = LumennGraphStore.getNode(this.#graphId, nodeId);
			const viewport = root.querySelector(".lf-viewport");
			if (!node || !viewport) return;
			const [width, height] = nodeSize(node.type, node.size);
			this.#selected = {
				kind: "node",
				id: nodeId
			};
			this.#camera.panX = viewport.clientWidth / 2 - (node.position.x + width / 2) * this.#camera.zoom;
			this.#camera.panY = viewport.clientHeight / 2 - (node.position.y + height / 2) * this.#camera.zoom;
			this.render()
		} else if (action === "set-initial") {
			LumennGraphStore.setActiveNode(this.#graphId, this.#selected.id).then(() => this.render())
		} else if (action === "group-create") {
			const scene = LumennGraphStore.getNode(this.#graphId, this.#selected.id);
			if (scene?.type !== "scene") return;
			const group = await LumennGraphStore.addNode(this.#graphId, {
				type: "group",
				position: {
					x: scene.position.x - GROUP_PADDING,
					y: scene.position.y - GROUP_PADDING
				},
				data: {
					title: game.i18n.localize("LUMENN_FRAME.Group.DefaultName")
				}
			});
			if (!group) return;
			await LumennGraphStore.updateNode(this.#graphId, scene.id, {
				parentId: group.id
			});
			this.#selected = {
				kind: "node",
				id: group.id
			};
			this.render()
		} else if (action === "group-add") {
			const target = root.querySelector('[data-insp-pick="groupTarget"]')?.value;
			if (!target) return;
			await LumennGraphStore.updateNode(this.#graphId, this.#selected.id, {
				parentId: target
			});
			this.render()
		} else if (action === "group-remove") {
			await LumennGraphStore.updateNode(this.#graphId, this.#selected.id, {
				parentId: null
			});
			this.render()
		} else if (action === "group-apply-rooms") {
			const groupId = this.#selected.id;
			const graph = LumennGraphStore.getGraph(this.#graphId);
			const checks = new Map([...root.querySelectorAll("[data-insp-room]")].map(el => [el.dataset.inspRoom, el.checked]));
			const patches = (graph?.nodes ?? []).filter(n => n.type === "scene").map(n => {
				const checked = !!checks.get(n.id);
				return {
					id: n.id,
					parentId: checked ? groupId : n.parentId === groupId ? null : n.parentId ?? null
				}
			});
			await LumennGraphStore.updateNodes(this.#graphId, patches);
			this.render()
		} else if (action === "delete-node") {
			LumennGraphStore.deleteNode(this.#graphId, this.#selected.id).then(() => {
				this.#selected = {
					kind: null,
					id: null
				};
				this.render()
			})
		} else if (action === "delete-edge") {
			const edgeId = e.currentTarget.dataset.inspEdge ?? this.#selected.id;
			LumennGraphStore.deleteEdge(this.#graphId, edgeId).then(() => {
				this.#selected = {
					kind: null,
					id: null
				};
				this.render()
			})
		} else if (action === "add-flow") {
			const targetId = root.querySelector('[data-insp-pick="flowTarget"]')?.value;
			if (targetId && this.#selected.kind === "node") {
				const edge = {
					id: `edge_${foundry.utils.randomID(16)}`,
					type: "flow",
					from: this.#selected.id,
					to: targetId
				};
				LumennGraphStore.addEdge(this.#graphId, edge).then(created => {
					if (created) {
						this.#selected = {
							kind: "edge",
							id: created.id
						};
						this.render()
					}
				})
			}
		} else if (action === "attach-audio") {
			const audioId = root.querySelector('[data-insp-pick="audioAttach"]')?.value;
			if (audioId && this.#selected.kind === "node") {
				const edge = {
					id: `edge_${foundry.utils.randomID(16)}`,
					type: "audio",
					from: audioId,
					to: this.#selected.id
				};
				LumennGraphStore.addEdge(this.#graphId, edge).then(created => {
					if (created) {
						this.#selected = {
							kind: "edge",
							id: created.id
						};
						this.render()
					}
				})
			}
		} else if (action === "preview-transition") {
			if (this.#previewing) return;
			const edge = LumennGraphStore.getEdge(this.#graphId, this.#selected.id);
			if (edge?.type !== "flow") return;
			const target = LumennGraphStore.getNode(this.#graphId, edge.to);
			const scene = target?.data?.sceneId ? game.scenes.get(target.data.sceneId) : null;
			const scope = ["audio", "scene", "both"].includes(edge.transition?.scope) ? edge.transition.scope : "both";
			const sceneTrans = edge.transition?.scene ?? {
				type: "cut",
				duration: 0
			};
			if ((scope === "scene" || scope === "both") && scene) {
				this.#previewing = true;
				e.currentTarget.disabled = true;
				this.element?.classList.add("lf-previewing");
				try {
					await LumennCompat.previewSceneTransition({
						scene,
						type: sceneTrans.type ?? "cut",
						duration: sceneTrans.duration ?? 1e3,
						color: normalizeHexColor(sceneTrans.color, "#000000")
					})
				} catch (error) {
					console.error("Lumenn Frame: preview da transição falhou.", error);
					ui.notifications.warn(game.i18n.localize("LUMENN_FRAME.WarnTransitionPreview"))
				} finally {
					this.#previewing = false;
					this.element?.classList.remove("lf-previewing");
					e.currentTarget.disabled = false
				}
			}
		} else if (action === "add-return") {
			LumennGraphStore.addReturn(this.#graphId, this.#selected.id).then(() => this.render())
		}
	}
	#inspectorSwatch(e) {
		if (!this.#editable()) return;
		const color = e.currentTarget.dataset.color;
		if (!color) return;
		const kind = this.#selected.kind;
		const id = this.#selected.id;
		if (kind !== "node" || !id) return;
		LumennGraphStore.updateNode(this.#graphId, id, {
			color
		}).then(() => this.render())
	}
	#audioSourcesFor(graph, nodeId) {
		const resolve = (targetId, visited = new Set) => {
			if (!targetId || visited.has(targetId)) return null;
			const nextVisited = new Set(visited);
			nextVisited.add(targetId);
			const node = graph?.nodes?.find(entry => entry.id === targetId);
			if (node?.type === "audio" && node.data?.audioType && node.data?.audioId) return {
				type: node.data.audioType === "playlist" ? "playlist" : "track",
				id: node.data.audioId,
				role: node.data.audioRole === "sfx" ? "sfx" : "music"
			};
			const incoming = (graph?.edges ?? []).filter(edge => edge.type === "audio" && edge.to === targetId);
			for (const edge of [...incoming].reverse()) {
				const source = resolve(edge.from, nextVisited);
				if (source) return source
			}
			return null
		};
		const root = graph?.nodes?.find(node => node.id === nodeId);
		if (root?.type === "audio") {
			const source = resolve(nodeId);
			return source ? [source] : []
		}
		const incoming = (graph?.edges ?? []).filter(edge => edge.type === "audio" && edge.to === nodeId);
		const candidates = incoming.map(edge => resolve(edge.from)).filter(Boolean);
		const music = candidates.filter(source => source.role === "music").at(-1);
		const seenSfx = new Set;
		const sfx = candidates.filter(source => {
			if (source.role !== "sfx") return false;
			const key = `${source.type}:${source.id}`;
			if (seenSfx.has(key)) return false;
			seenSfx.add(key);
			return true
		});
		return [...music ? [music] : [], ...sfx]
	}
	#audioSourceOf(node) {
		if (node?.type !== "audio" || !node.data?.audioType || !node.data?.audioId) return null;
		return {
			type: node.data.audioType === "playlist" ? "playlist" : "track",
			id: node.data.audioId,
			role: node.data.audioRole === "sfx" ? "sfx" : "music"
		}
	}
	#isAudioPlaying(source) {
		return !!LumennCompat.resolveAudioDoc(source)?.playing
	}
	async #playAudioNode(id) {
		if (this.#transitioning || !LumennCompat.isGM()) return;
		const graph = LumennGraphStore.getGraph(this.#graphId);
		const node = graph?.nodes?.find(n => n.id === id);
		const source = this.#audioSourceOf(node);
		if (!source) return;
		if (!LumennCompat.resolveAudioDoc(source)) {
			ui.notifications.warn(game.i18n.localize("LUMENN_FRAME.WarnInvalidAudioSource"));
			return
		}
		const fallbackDuration = LumennGraphStore.getDefaultCrossfadeDuration();
		const edges = (graph.edges ?? []).filter(e => e.type === "audio" && e.from === id);
		const edge = edges.find(e => e.to === graph.activeNodeId) ?? edges[0];
		const cfg = {
			curve: "linear",
			...edge?.transition?.audio ?? {}
		};
		const isSfx = source.role === "sfx";
		const crossfade = cfg.crossfadeDuration ?? fallbackDuration;
		const duration = isSfx ? cfg.fadeInDuration ?? 0 : crossfade;
		const playing = this.#isAudioPlaying(source);
		let audioTrans;
		let current;
		if (playing) {
			audioTrans = {
				mode: "fadeout",
				crossfadeDuration: duration,
				curve: cfg.curve
			};
			current = [source]
		} else {
			const mode = cfg.mode === "cut" || cfg.mode === "fadein" ? cfg.mode : "crossfade";
			audioTrans = {
				mode,
				crossfadeDuration: duration,
				curve: cfg.curve
			};
			current = isSfx ? [] : this.#allAudioSources(graph).filter(s => s.role === "music" && !(s.type === source.type && s.id === source.id))
		}
		const result = await this.#controller.goToAudio(current, playing ? [] : [source], audioTrans, fallbackDuration, cfg.curve);
		if (result === "invalid-source") ui.notifications.warn(game.i18n.localize("LUMENN_FRAME.WarnInvalidAudioSource"));
		await this.render()
	}
	#allAudioSources(graph) {
		const sources = [];
		const seen = new Set;
		for (const node of graph?.nodes ?? []) {
			if (node.type !== "audio" || !node.data?.audioType || !node.data?.audioId) continue;
			const source = {
				type: node.data.audioType === "playlist" ? "playlist" : "track",
				id: node.data.audioId,
				role: node.data.audioRole === "sfx" ? "sfx" : "music"
			};
			const key = `${source.role}:${source.type}:${source.id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			sources.push(source)
		}
		return sources
	}
	#audioTransitionFor(graph, flowEdge) {
		const base = {
			mode: "auto",
			crossfadeDuration: LumennGraphStore.getDefaultCrossfadeDuration(),
			fadeInDuration: 0,
			fadeOutDuration: 0,
			curve: "linear",
			...flowEdge.transition?.audio ?? {}
		};
		for (const audioEdge of graph?.edges ?? []) {
			if (audioEdge.type !== "audio" || audioEdge.to !== flowEdge.to) continue;
			Object.assign(base, audioEdge.transition?.audio ?? {})
		}
		return base
	}
	async #navigateTo(id) {
		if (this.#transitioning) return;
		const graph = LumennGraphStore.getGraph(this.#graphId);
		const edge = graph?.edges?.find(e => (e.type === "flow" || e.type === "audio") && e.from === graph.activeNodeId && e.to === id);
		if (!edge) return;
		if (LumennSettings.get("confirmSceneTransition")) {
			const ok = await foundry.applications.api.DialogV2.confirm({
				title: game.i18n.localize("LUMENN_FRAME.Toolbar.LiveMode"),
				content: game.i18n.localize("LUMENN_FRAME.ConfirmTransition"),
				yes: {
					label: game.i18n.localize("LUMENN_FRAME.Edge.Go")
				},
				no: {
					label: game.i18n.localize("LUMENN_FRAME.Config.Cancel")
				}
			});
			if (!ok) return
		}
		this.#transitioning = true;
		await this.render();
		try {
			const scope = edge.type === "audio" ? "audio" : ["audio", "scene", "both"].includes(edge.transition?.scope) ? edge.transition.scope : "both";
			const sceneTrans = edge.transition?.scene ?? {
				type: "cut",
				duration: 0
			};
			const audioTrans = this.#audioTransitionFor(graph, edge);
			const targetNode = graph.nodes.find(n => n.id === id);
			const scene = targetNode?.data?.sceneId ? game.scenes.get(targetNode.data.sceneId) : null;
			const currentSources = this.#allAudioSources(graph);
			const targetSources = this.#audioSourcesFor(graph, id);
			LumennCompat.socketEmit({
				type: "transition:start",
				sceneId: scene?.id ?? null,
				sceneTrans,
				audioTrans,
				scope
			});
			const sameScene = scene?.id && canvas.scene?.id === scene.id;
			const sceneTask = (scope === "scene" || scope === "both") && scene ? (async () => {
				if (sameScene) {
					if (LumennCompat.isGM() && !scene.active) await LumennCompat.activateScene(scene, {
						transition: {
							type: null
						}
					}, {
						suppressScenePlaylist: true
					});
					return
				}
				const scResult = await LumennCompat.runSceneTransition({
					scene,
					type: sceneTrans.type ?? "cut",
					duration: sceneTrans.duration ?? 1e3,
					color: normalizeHexColor(sceneTrans.color, "#000000"),
					playersTransition: LumennSettings.get("playerSceneFade")
				});
				if (scResult === "fallback") {
					ui.notifications.warn(game.i18n.localize("LUMENN_FRAME.WarnSceneTransitionFallback"));
					await lumennClientSceneFade(scene.id, sceneTrans)
				}
			})() : null;
			const audioTask = scope === "audio" || scope === "both" ? this.#controller.goToAudio(currentSources, targetSources, audioTrans, LumennGraphStore.getDefaultCrossfadeDuration(), audioTrans?.curve ?? "linear") : null;
			const [, audioResult] = await Promise.all([sceneTask, audioTask]);
			if (audioResult === "invalid-source") ui.notifications.warn(game.i18n.localize("LUMENN_FRAME.WarnInvalidAudioSource"));
			await LumennGraphStore.setActiveNode(this.#graphId, id);
			LumennCompat.socketEmit({
				type: "transition:end"
			})
		} finally {
			this.#transitioning = false;
			await this.render()
		}
	}
	#nodeLabel(node) {
		if (node.type === "group") return node.data?.title || game.i18n.localize("LUMENN_FRAME.Group.DefaultName");
		if (node.type === "scene") {
			const s = node.data?.sceneId ? game.scenes.get(node.data.sceneId) : null;
			return s?.name ?? "Scene"
		}
		if (node.type === "audio") return this.#audioLabel(node.data).name;
		return node.data?.title || "Note"
	}
	#buildInspector(graph) {
		const base = {
			colors: COLORS,
			sizes: SIZES,
			liveAudioEditing: this.#canEditLiveAudio(),
			scenes: [...game.scenes.values()].map(s => ({
				id: s.id,
				name: s.name
			})),
			playlistsForAudio: [...game.playlists.values()].map(p => ({
				id: p.id,
				name: p.name,
				sounds: [...p.sounds.values()].map(s => ({
					uuid: s.uuid,
					name: s.name
				}))
			}))
		};
		if (this.#selected.kind === "node") {
			const node = graph?.nodes?.find(n => n.id === this.#selected.id);
			if (node) {
				const edges = (graph?.edges ?? []).filter(e => e.from === node.id || e.to === node.id).map(e => ({
					...e,
					fromLabel: this.#nodeLabel(graph.nodes.find(n => n.id === e.from)),
					toLabel: this.#nodeLabel(graph.nodes.find(n => n.id === e.to))
				}));
				return {
					...base,
					kind: "node",
					node,
					nodeType: node.type,
					audioRole: node.data?.audioRole === "sfx" ? "sfx" : "music",
					nodeEdges: edges,
					flowTargets: (graph?.nodes ?? []).filter(n => n.type === "scene" && n.id !== node.id).map(n => ({
						id: n.id,
						name: this.#nodeLabel(n)
					})),
					audioNodes: (graph?.nodes ?? []).filter(n => n.type === "audio").map(n => ({
						id: n.id,
						name: this.#nodeLabel(n)
					})),
					groups: (graph?.nodes ?? []).filter(n => n.type === "group" && n.id !== node.id).map(n => ({
						id: n.id,
						name: this.#nodeLabel(n)
					})),
					groupCount: node.type === "group" ? childrenOf(graph?.nodes ?? [], node.id).length : 0,
					groupScenes: node.type === "group" ? (graph?.nodes ?? []).filter(n => n.type === "scene").map(n => ({
						id: n.id,
						name: this.#nodeLabel(n),
						inGroup: n.parentId === node.id
					})) : []
				}
			}
		}
		if (this.#selected.kind === "edge") {
			const edge = graph?.edges?.find(e => e.id === this.#selected.id);
			if (edge) {
				const from = graph.nodes.find(n => n.id === edge.from);
				const to = graph.nodes.find(n => n.id === edge.to);
				const reverse = edge.type === "flow" && graph.edges.some(x => x.type === "flow" && x.from === edge.to && x.to === edge.from);
				const transitionScope = ["audio", "scene", "both"].includes(edge.transition?.scope) ? edge.transition.scope : "both";
				return {
					...base,
					kind: "edge",
					edge,
					sceneColor: normalizeHexColor(edge.transition?.scene?.color, "#000000"),
					edgeType: edge.type,
					audioTransition: edge.transition?.audio ?? {
						mode: "auto",
						crossfadeDuration: LumennGraphStore.getDefaultCrossfadeDuration(),
						fadeInDuration: 0,
						fadeOutDuration: 0,
						curve: "linear"
					},
					transitionScope,
					fromLabel: from ? this.#nodeLabel(from) : edge.from,
					toLabel: to ? this.#nodeLabel(to) : edge.to,
					reverse,
					sceneTransitions: LumennCompat.getSceneTransitions(),
					hasNativeTransitions: LumennCompat.hasNativeSceneTransitions(),
					canPreviewTransition: edge.type === "flow" && transitionScope !== "audio" && !!to?.data?.sceneId,
					curveOptions: ["linear", "equal-power"]
				}
			}
		}
		return {
			...base,
			kind: "graph",
			audioNodeIndex: (graph?.nodes ?? []).filter(node => node.type === "audio").map(node => ({
				id: node.id,
				name: this.#nodeLabel(node)
			}))
		}
	}
}
