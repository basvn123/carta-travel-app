"""Request and response models: the OpenAPI contract (docs/reference/openapi.md)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Layer = Literal["place", "trail", "beach", "lake", "mountain"]
Use = Literal["filter", "profile", "search", "all"]
Id = Field(min_length=1, max_length=120)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------------ /tag
class TagItem(Strict):
    layer: Layer
    id: str | None = Field(None, min_length=1, max_length=120, description="A catalogue id; the tagger reads its shipped text")
    name: str | None = Field(None, max_length=200, description="Free text mode: the item's name")
    text: str | None = Field(None, max_length=20000, description="Free text mode: the text to tag")

    @model_validator(mode="after")
    def one_mode(self):
        if bool(self.id) == bool(self.text):
            raise ValueError("give either id (catalogue item) or text (free text), not both")
        return self


class TagRequest(Strict):
    items: list[TagItem] = Field(min_length=1, max_length=100)
    use: Use = Field("profile", description="Return the tags at or over this use's threshold; all returns every candidate")
    evidence: bool = Field(True, description="Include the quoted passages behind each tag")


class Evidence(BaseModel):
    src: str
    text: str
    match: str | None = None


class Tag(BaseModel):
    tag: str
    label: str
    facet: str | None
    score: float
    by: list[str]
    uses: list[str]
    implied: bool
    evidence: list[Evidence] = []


class TagResult(BaseModel):
    layer: Layer
    id: str | None
    name: str | None
    found: bool = Field(description="False when the catalogue id is unknown; tags is then empty")
    n_passages: int
    tags: list[Tag]


class TagResponse(BaseModel):
    tagger_version: int
    taxonomy_version: str
    thresholds: dict[str, float]
    results: list[TagResult]


# ------------------------------------------------------------------ /taxonomy
class TaxonomyNode(BaseModel):
    id: str
    facet: str | None
    parent: str | None
    level: int | None
    label: dict[str, str]
    definition: str | None
    synonyms: dict[str, list[str]]
    applies_to: list[str]
    source: str | None
    children: list[str]


class TaxonomyResponse(BaseModel):
    version: str
    facets: list[str]
    count: int
    nodes: list[TaxonomyNode]


# ------------------------------------------------------------------ /link
class LinkContext(Strict):
    country: str | None = Field(None, min_length=2, max_length=2, description="ISO 3166-1 alpha-2")
    airport: str | None = Field(None, min_length=3, max_length=3, description="IATA code")
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)


class Mention(Strict):
    text: str = Field(min_length=1, max_length=300)
    ctx: LinkContext | None = None


class LinkRequest(Strict):
    mentions: list[Mention] = Field(min_length=1, max_length=100)
    limit: int = Field(5, ge=1, le=10, description="Candidates per mention")


class Candidate(BaseModel):
    id: str
    name: str | None
    score: float
    members: list[str] = Field(description="The catalogue ids this place stands for (a city and its airports)")


class DidYouMean(BaseModel):
    id: str
    name: str | None
    score: float


class LinkResult(BaseModel):
    text: str
    confident: bool
    linked: Candidate | None
    candidates: list[Candidate]
    did_you_mean: list[DidYouMean]


class LinkResponse(BaseModel):
    results: list[LinkResult]


# ------------------------------------------------------------------ /similar
class ItemRef(Strict):
    layer: Layer
    id: str = Id


class SimilarRequest(Strict):
    item: ItemRef | None = Field(None, description="Find items like this one")
    tags: list[str] | None = Field(None, max_length=50, description="Or: find items carrying these taxonomy ids")
    k: int = Field(10, ge=1, le=50)
    layers: list[Layer] | None = Field(None, description="Only items of these layers")
    among: list[str] | None = Field(None, max_length=500, description="Only these index keys (layer:id), for a shortlist")

    @model_validator(mode="after")
    def one_query(self):
        if bool(self.item) == bool(self.tags):
            raise ValueError("give either item or tags")
        return self


class Neighbour(BaseModel):
    key: str
    layer: str
    id: str
    name: str | None
    country: str | None
    score: float = Field(description="Cosine of the TF-IDF tag vectors, 0 to 1")
    shared: list[str] = Field(description="Up to three taxonomy ids that weigh most in the match")


class SimilarResponse(BaseModel):
    query: str
    index_items: int
    found: bool
    neighbours: list[Neighbour]


# ------------------------------------------------------------------ /profile
class Save(Strict):
    key: str = Field(min_length=1, max_length=200)
    kind: Literal["dest", "trail", "beach", "lake", "mountain", "cycle"]
    id: str = Field(min_length=1, max_length=120)
    name: str | None = Field(None, max_length=200)
    at: str | int | None = None


class Trip(Strict):
    id: str = Field(min_length=1, max_length=120)
    name: str | None = Field(None, max_length=200)
    at: str | int | None = None
    destIds: list[str] = Field(default_factory=list, max_length=60)


class Filters(Strict):
    likes: list[str] = Field(default_factory=list, max_length=50)
    tripKinds: list[str] = Field(default_factory=list, max_length=50)
    at: str | int | None = None


class Verdict(Strict):
    v: Literal["accept", "reject"]
    at: str | int | None = None


class ProfileRequest(Strict):
    saves: list[Save] = Field(default_factory=list, max_length=500)
    trips: list[Trip] = Field(default_factory=list, max_length=200)
    filters: Filters = Field(default_factory=Filters)
    verdicts: dict[str, Verdict] = Field(default_factory=dict, max_length=300)
    now: str | None = Field(None, description="ISO time the decay is measured from; default the server clock")
    all: bool = Field(False, description="The opened card: up to twelve chips instead of six")


class ChipEvidence(BaseModel):
    saves: int
    trips: int
    filters: int
    names: list[str]
    more: int


class Chip(BaseModel):
    node: str
    label: str
    facet: str | None
    verdict: str | None
    lift: float
    evidence_weight: float
    evidence: ChipEvidence


class ProfileResponse(BaseModel):
    taxonomy_version: str
    item_count: int
    shown: list[Chip]
    held: list[Chip]
    hidden: list[Chip]
    weights: dict[str, float] = Field(description="+1 accepted, -3 rejected: a ranker's negatives, never a filter")
    snapshot: dict


class Health(BaseModel):
    ok: bool
    version: str
    bridge: bool
    similar_index_items: int
