import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type {
	AccessMember,
	AccessMembers,
	AccessRole,
} from "../../../../shared/contracts";
import { ApiError, api } from "../../../shared/api";
import {
	Alert,
	AlertDialog,
	Avatar,
	Button,
	Chip,
	ErrorState,
	Form,
	Label,
	ListBox,
	LoadingState,
	Modal,
	QueryEmptyState,
	Select,
	SelectField,
	TextInputField,
	TrashIcon,
	Typography,
	UserPlusIcon,
} from "../../../shared/ui";

const roleOptions = [
	{ value: "member", label: "구성원" },
	{ value: "admin", label: "관리자" },
	{ value: "owner", label: "소유자" },
];

function roleLabel(role: AccessRole) {
	return roleOptions.find((option) => option.value === role)?.label ?? role;
}

function errorMessage(error: unknown): string {
	return error instanceof ApiError
		? error.message
		: "Access 역할을 변경하지 못했습니다.";
}

function MemberRow({
	member,
	isPending,
	onUpdate,
	onRemove,
}: {
	member: AccessMember;
	isPending: boolean;
	onUpdate: (role: AccessRole, displayName: string) => void;
	onRemove: () => void;
}) {
	const [draftRole, setDraftRole] = useState(member.role);
	const [draftDisplayName, setDraftDisplayName] = useState(
		member.displayName ?? "",
	);
	const visibleName = member.displayName?.trim() || member.email;
	const normalizedDraftName = draftDisplayName.trim();

	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-b border-border py-3 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
			<Avatar className="row-span-2" size="sm" variant="soft">
				<Avatar.Fallback>
					{visibleName.slice(0, 1).toUpperCase()}
				</Avatar.Fallback>
			</Avatar>
			<Typography.Paragraph
				truncate
				weight="medium"
				onClickCapture={(event) => event.preventDefault()}
			>
				{visibleName}
			</Typography.Paragraph>
			<div className="col-start-3 row-span-2 flex items-center sm:col-start-4">
				<Modal>
					<Button
						isDisabled={isPending}
						variant="ghost"
						onPress={() => {
							setDraftRole(member.role);
							setDraftDisplayName(member.displayName ?? "");
						}}
					>
						관리
					</Button>
					<Modal.Backdrop>
						<Modal.Container
							className="sm:p-10"
							placement="center"
							scroll="inside"
							size="full"
						>
							<Modal.Dialog className="sm:h-auto sm:min-h-0 sm:max-w-sm sm:rounded-3xl sm:shadow-overlay">
								{({ close }) => (
									<>
										<Modal.CloseTrigger />
										<Modal.Header>
											<Modal.Heading>구성원 관리</Modal.Heading>
											<Typography.Paragraph color="muted" size="sm">
												{member.email}
											</Typography.Paragraph>
										</Modal.Header>
										<Modal.Body className="grid content-start gap-4">
											<TextInputField
												description="비워두면 목록에 이메일이 표시됩니다."
												isDisabled={isPending}
												label="이름"
												maxLength={80}
												placeholder="표시할 이름"
												value={draftDisplayName}
												onValueChange={setDraftDisplayName}
											/>
											<Select
												fullWidth
												aria-label={`${member.email} 권한`}
												isDisabled={isPending || member.bootstrap}
												selectedKey={draftRole}
												onSelectionChange={(key) =>
													setDraftRole(String(key) as AccessRole)
												}
											>
												<Label>권한</Label>
												<Select.Trigger>
													<Select.Value />
													<Select.Indicator />
												</Select.Trigger>
												<Select.Popover>
													<ListBox>
														{roleOptions.map((option) => (
															<ListBox.Item
																id={option.value}
																key={option.value}
																textValue={option.label}
															>
																{option.label}
																<ListBox.ItemIndicator />
															</ListBox.Item>
														))}
													</ListBox>
												</Select.Popover>
											</Select>
											<Typography.Paragraph color="muted">
												{member.bootstrap
													? "초기 소유자의 역할은 변경할 수 없습니다."
													: "권한 변경은 Cloudflare Access 정책과 기존 세션에 반영됩니다."}
											</Typography.Paragraph>
										</Modal.Body>
										<Modal.Footer>
											{!member.bootstrap && (
												<AlertDialog>
													<Button
														className="me-auto"
														isDisabled={isPending}
														variant="danger"
													>
														<TrashIcon size={16} />
														제거
													</Button>
													<AlertDialog.Backdrop>
														<AlertDialog.Container placement="center">
															<AlertDialog.Dialog>
																<AlertDialog.Header>
																	<AlertDialog.Heading>
																		구성원을 제거할까요?
																	</AlertDialog.Heading>
																</AlertDialog.Header>
																<AlertDialog.Body>
																	<Typography.Paragraph color="muted">
																		{member.email}의 이 프로젝트 역할이
																		제거되고, Cloudflare 계정의 기존 Access
																		세션도 취소됩니다. 표시 이름과 감사 기록은
																		운영 이력으로 보존됩니다.
																	</Typography.Paragraph>
																</AlertDialog.Body>
																<AlertDialog.Footer>
																	<Button slot="close" variant="secondary">
																		취소
																	</Button>
																	<Button
																		slot="close"
																		isPending={isPending}
																		variant="danger"
																		onPress={onRemove}
																	>
																		제거
																	</Button>
																</AlertDialog.Footer>
															</AlertDialog.Dialog>
														</AlertDialog.Container>
													</AlertDialog.Backdrop>
												</AlertDialog>
											)}
											<Button variant="secondary" onPress={close}>
												취소
											</Button>
											<Button
												isDisabled={
													(draftRole === member.role &&
														normalizedDraftName ===
															(member.displayName ?? "")) ||
													isPending
												}
												isPending={isPending}
												onPress={() => {
													onUpdate(draftRole, normalizedDraftName);
													close();
												}}
											>
												저장
											</Button>
										</Modal.Footer>
									</>
								)}
							</Modal.Dialog>
						</Modal.Container>
					</Modal.Backdrop>
				</Modal>
			</div>
			<div className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 sm:col-start-2 sm:col-span-2">
				{member.displayName && (
					<Typography.Paragraph
						truncate
						color="muted"
						size="xs"
						onClickCapture={(event) => event.preventDefault()}
					>
						{member.email}
					</Typography.Paragraph>
				)}
				<Chip
					color={member.role === "owner" ? "accent" : "default"}
					size="sm"
					variant="soft"
				>
					{roleLabel(member.role)}
				</Chip>
				{member.bootstrap && (
					<Typography.Paragraph color="muted" size="xs">
						초기 소유자
					</Typography.Paragraph>
				)}
			</div>
		</div>
	);
}

export function AccessMemberManager() {
	const queryClient = useQueryClient();
	const [displayName, setDisplayName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<AccessRole>("member");
	const members = useQuery({
		queryKey: ["access-members"],
		queryFn: api.accessMembers.list,
		retry: false,
	});
	const mutation = useMutation({
		mutationFn: (
			input:
				| {
						kind: "set";
						email: string;
						role: AccessRole;
						displayName: string;
				  }
				| { kind: "remove"; email: string },
		) =>
			input.kind === "set"
				? api.accessMembers.setRole(input.email, {
						role: input.role,
						displayName: input.displayName,
					})
				: api.accessMembers.remove(input.email),
		onSuccess: (data: AccessMembers) => {
			queryClient.setQueryData(["access-members"], data);
			setDisplayName("");
			setEmail("");
			setRole("member");
		},
	});

	if (members.isLoading) {
		return <LoadingState label="Access 구성원을 불러오는 중" />;
	}
	if (members.isError || !members.data) {
		return <ErrorState message={errorMessage(members.error)} />;
	}

	return (
		<div className="grid gap-4">
			{mutation.isError && (
				<Alert status="danger">
					<Alert.Content>
						<Alert.Title>구성원 변경 실패</Alert.Title>
						<Alert.Description>
							{errorMessage(mutation.error)}
						</Alert.Description>
					</Alert.Content>
				</Alert>
			)}

			<div className="flex items-end justify-between gap-3">
				<div>
					<Typography.Heading className="text-xl" level={2}>
						현재 구성원
					</Typography.Heading>
					<Typography.Paragraph color="muted" size="xs">
						역할 변경은 Access 정책과 기존 로그인 세션에 즉시 반영됩니다.
					</Typography.Paragraph>
				</div>
				<Chip size="sm" variant="soft">
					{members.data.members.length}명
				</Chip>
			</div>
			<section aria-label="Access 구성원" className="border-y border-border">
				{members.data.members.length === 0 ? (
					<QueryEmptyState
						title="구성원이 없습니다"
						description="첫 구성원을 추가하세요."
					/>
				) : (
					members.data.members.map((member) => (
						<MemberRow
							key={member.email}
							member={member}
							isPending={mutation.isPending}
							onUpdate={(nextRole, nextDisplayName) =>
								mutation.mutate({
									kind: "set",
									email: member.email,
									role: nextRole,
									displayName: nextDisplayName,
								})
							}
							onRemove={() =>
								mutation.mutate({
									kind: "remove",
									email: member.email,
								})
							}
						/>
					))
				)}
			</section>

			<section className="grid gap-3">
				<div className="flex items-center gap-2">
					<UserPlusIcon size={18} />
					<div>
						<Typography.Heading className="text-base" level={2}>
							구성원 추가
						</Typography.Heading>
						<Typography.Paragraph color="muted" size="xs">
							이름, 이메일과 역할을 입력해 Access 접근 권한을 부여합니다.
						</Typography.Paragraph>
					</div>
				</div>
				<Form
					className="grid gap-3 border-y border-border py-4 md:grid-cols-2 md:items-end lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_10rem_auto]"
					onSubmit={(event) => {
						event.preventDefault();
						const normalizedDisplayName = displayName.trim();
						const normalizedEmail = email.trim().toLowerCase();
						if (!normalizedDisplayName || !normalizedEmail) return;
						mutation.mutate({
							kind: "set",
							displayName: normalizedDisplayName,
							email: normalizedEmail,
							role,
						});
					}}
				>
					<TextInputField
						isDisabled={mutation.isPending}
						label="이름"
						maxLength={80}
						placeholder="홍길동"
						required
						value={displayName}
						onValueChange={setDisplayName}
					/>
					<TextInputField
						isDisabled={mutation.isPending}
						label="이메일"
						placeholder="teammate@example.com"
						required
						type="email"
						value={email}
						onValueChange={setEmail}
					/>
					<SelectField
						isDisabled={mutation.isPending}
						label="역할"
						options={roleOptions}
						value={role}
						onValueChange={(value) => setRole(value as AccessRole)}
					/>
					<Button
						className="md:col-span-2 lg:col-span-1"
						isPending={mutation.isPending}
						type="submit"
						variant="primary"
					>
						<UserPlusIcon size={18} />
						추가
					</Button>
				</Form>
			</section>
		</div>
	);
}
